defmodule TuixPhoenixTest do
  use ExUnit.Case, async: false
  import Phoenix.LiveViewTest

  defmodule User do
    defstruct [:id, :name, :email]
  end

  setup do
    previous = Application.get_all_env(:tuix_phoenix)
    for {key, _} <- previous, do: Application.delete_env(:tuix_phoenix, key)

    on_exit(fn ->
      for {key, _} <- Application.get_all_env(:tuix_phoenix),
          do: Application.delete_env(:tuix_phoenix, key)

      for {key, value} <- previous, do: Application.put_env(:tuix_phoenix, key, value)
    end)

    :ok
  end

  defp hmac(secret, message),
    do: Base.encode16(:crypto.mac(:hmac, :sha256, secret, message), case: :lower)

  test "shared signing vectors agree with Node and Rails" do
    vectors =
      Path.expand("../../test-fixtures/identity-signing.json", __DIR__)
      |> File.read!()
      |> Jason.decode!()

    for vector <- vectors["cases"] do
      user = Map.new(vector["user"], fn {key, value} -> {String.to_existing_atom(key), value} end)
      identity = TuixPhoenix.identity(user, vectors["secret"])
      assert identity.id == vector["signed"]["id"]
      assert identity.hash == vector["signed"]["hash"], vector["label"]
    end
  end

  test "shared v3 signing vectors agree with Node and the server" do
    vectors =
      Path.expand("../../test-fixtures/identity-signing.json", __DIR__)
      |> File.read!()
      |> Jason.decode!()

    atomize = fn user ->
      Map.new(user, fn {key, value} -> {String.to_existing_atom(key), value} end)
    end

    for vector <- vectors["v3_cases"] do
      identity = TuixPhoenix.identity(atomize.(vector["user"]), vectors["secret"])

      signed = vector["signed"]
      assert identity.hash == signed["hash"], vector["label"]
      assert identity.id == signed["id"]
      assert identity.group == signed["group"]
      assert identity[:group_name] == signed["group_name"]
    end

    for vector <- vectors["v3_rejected"] do
      assert_raise ArgumentError, fn ->
        TuixPhoenix.identity(atomize.(vector["user"]), vectors["secret"])
      end
    end
  end

  test "widget/1 config replaces the application environment for that render" do
    secret = String.duplicate("s", 32)
    user = %{id: 7, name: "Ada", group: "acme", group_name: "Acme"}

    # Dormant without an environment or a config.
    assert render_component(&TuixPhoenix.widget/1, user: user) ==
             "<div id=\"tuix-phoenix\" hidden></div>"

    config = %{
      project: "pk_per_render",
      api: "https://tuix.example",
      secret: secret,
      environment: "production"
    }

    html = render_component(&TuixPhoenix.widget/1, user: user, config: config)
    refute html =~ secret
    assert html =~ "pk_per_render"
    assert html =~ "https://tuix.example"
    assert html =~ "&quot;environment&quot;:&quot;production&quot;"

    # The signed v3 identity carries the group, signed with the per-render secret.
    hash = TuixPhoenix.identity(user, secret).hash
    assert html =~ hash
    assert html =~ "&quot;group&quot;:&quot;acme&quot;"

    # The config wins over the application environment.
    configure()
    html = render_component(&TuixPhoenix.widget/1, user: user, config: config)
    assert html =~ "pk_per_render"
    refute html =~ "preview_1"
    assert render_component(&TuixPhoenix.widget/1, user: user) =~ "preview_1"
  end

  test "an empty group name is no group name, as in the Node SDK" do
    secret = String.duplicate("s", 32)
    plain = TuixPhoenix.identity(%{id: "1", name: "Ada", group: "acme"}, secret)

    assert TuixPhoenix.identity(%{id: "1", name: "Ada", group: "acme", group_name: ""}, secret) ==
             plain

    assert TuixPhoenix.identity(%{id: "1", name: "Ada", group: nil, group_name: ""}, secret).hash ==
             hmac(secret, "1")

    refute Map.has_key?(plain, :group_name)
  end

  test "an incomplete or string-keyed widget config raises or works, never renders nothing" do
    user = %{id: 7, name: "Ada"}
    secret = String.duplicate("s", 32)

    for config <- [%{}, %{project: "pk"}, %{project: "pk", api: "https://t.example"}] do
      error =
        assert_raise ArgumentError, fn ->
          render_component(&TuixPhoenix.widget/1, user: user, config: config)
        end

      assert error.message =~ "missing"
      refute error.message =~ secret
    end

    html =
      render_component(&TuixPhoenix.widget/1,
        user: user,
        config: %{"project" => "pk_str", "api" => "https://t.example", "secret" => secret}
      )

    assert html =~ "pk_str"
  end

  test "identity signs the exact ID, never the name" do
    secret = String.duplicate("s", 32)
    identity = TuixPhoenix.identity(%{id: 42, name: "Alice"}, secret)
    assert TuixPhoenix.identity(%User{id: 42, name: "Alice"}, secret) == identity
    assert identity == %{id: "42", name: "Alice", hash: hmac(secret, "42")}
    assert TuixPhoenix.identity(%{id: 42, name: "Bob"}, secret).hash == identity.hash
    assert TuixPhoenix.identity(nil, secret) == nil
    assert_raise ArgumentError, fn -> TuixPhoenix.identity(%{id: "", name: "Alice"}, secret) end
    assert_raise ArgumentError, fn -> TuixPhoenix.identity(%{id: "1", name: "Alice"}, "short") end
  end

  test "an email is signed with the ID (v2), trimmed and lowercased, so Tuix can trust it" do
    secret = String.duplicate("s", 32)

    identity =
      TuixPhoenix.identity(%{id: 42, name: "Alice", email: " Alice@Example.test "}, secret)

    assert TuixPhoenix.identity(
             %User{id: 42, name: "Alice", email: " Alice@Example.test "},
             secret
           ) == identity

    assert identity.email == "Alice@Example.test"
    assert identity.hash == hmac(secret, "42\nalice@example.test")
    refute identity.hash == hmac(secret, "42")

    # Changing the email changes the signature: a page cannot swap in another address.
    other = TuixPhoenix.identity(%{id: 42, name: "Alice", email: "eve@example.test"}, secret)
    refute other.hash == identity.hash

    assert TuixPhoenix.identity(%{id: 42, name: "Alice", email: nil}, secret).hash ==
             hmac(secret, "42")

    assert_raise ArgumentError, fn ->
      TuixPhoenix.identity(%{id: 42, name: "Alice", email: "not an email"}, secret)
    end
  end

  test "configuration is dormant until complete, HTML escapes identity, secret stays server-side" do
    assert render_component(&TuixPhoenix.widget/1, user: nil) ==
             "<div id=\"tuix-phoenix\" hidden></div>"

    configure()

    html =
      render_component(&TuixPhoenix.widget/1,
        user: %{id: "alice", name: "</div><script>alert(1)</script>"}
      )

    refute html =~ String.duplicate("secret", 8)
    refute html =~ "<script>"
    assert html =~ "&lt;script&gt;"
    assert html =~ "preview_1"
    assert render_component(&TuixPhoenix.widget/1, user: nil) =~ "&quot;user&quot;:null"
  end

  test "rejects non-origin and remote HTTP API configuration" do
    configure()

    for api <- [
          "http://example.test",
          "https://example.test/private",
          "https://user:pass@example.test"
        ] do
      Application.put_env(:tuix_phoenix, :api, api)
      assert_raise ArgumentError, fn -> render_component(&TuixPhoenix.widget/1, user: nil) end
    end
  end

  test "hosted is default; bundled is an explicit opt-in and invalid modes fail" do
    configure()
    html = render_component(&TuixPhoenix.widget/1, user: %{id: "alice", name: "Alice"})
    assert html =~ "&quot;delivery&quot;:&quot;hosted&quot;"
    assert html =~ "&quot;loader&quot;:null"

    Application.put_env(:tuix_phoenix, :delivery, :bundled)
    html = render_component(&TuixPhoenix.widget/1, user: %{id: "alice", name: "Alice"})
    assert html =~ "&quot;delivery&quot;:&quot;bundled&quot;"
    assert html =~ "/tuix-assets/"

    Application.put_env(:tuix_phoenix, :delivery, :preview)
    assert_raise ArgumentError, fn -> render_component(&TuixPhoenix.widget/1, user: nil) end
  end

  test "the integration script is not tracked as a host static asset" do
    configure()
    html = render_component(&TuixPhoenix.assets/1, nonce: "n")
    assert html =~ "/tuix-assets/"
    # Not in the host's manifest: static_changed?/1 would always be true and reload forever.
    refute html =~ "phx-track-static"
  end

  test "bundled assets are served with integrity matching shipped bytes" do
    opts = TuixPhoenix.Plug.init([])

    for asset <- [TuixPhoenix.Assets.bootstrap(), TuixPhoenix.Assets.loader()] do
      conn = Plug.Test.conn(:get, asset.url) |> TuixPhoenix.Plug.call(opts)
      assert conn.status == 200
      assert conn.halted
      assert asset.integrity == "sha384-" <> Base.encode64(:crypto.hash(:sha384, conn.resp_body))

      assert Plug.Conn.get_resp_header(conn, "cache-control") == [
               "public, max-age=31536000, immutable"
             ]
    end

    refute TuixPhoenix.Plug.call(Plug.Test.conn(:get, "/unrelated"), opts).halted
  end

  defp configure do
    for {key, value} <- [
          project: "project_1",
          api: "https://tuix.example.test",
          secret: String.duplicate("secret", 8),
          environment: "preview_1"
        ],
        do: Application.put_env(:tuix_phoenix, key, value)
  end
end
