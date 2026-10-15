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
