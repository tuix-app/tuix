defmodule TuixHostWeb.TuixIntegrationTest do
  use TuixHostWeb.ConnCase, async: false
  import Phoenix.LiveViewTest

  test "installed layout signs the host identity and serves its bundled bootstrap", %{conn: conn} do
    previous = Application.get_all_env(:tuix_phoenix)

    on_exit(fn ->
      for {key, _} <- Application.get_all_env(:tuix_phoenix),
          do: Application.delete_env(:tuix_phoenix, key)

      for {key, value} <- previous, do: Application.put_env(:tuix_phoenix, key, value)
    end)

    secret = String.duplicate("smoke", 8)

    for {key, value} <- [project: "fixture", api: "https://tuix.example.test", secret: secret],
        do: Application.put_env(:tuix_phoenix, key, value)

    html =
      render_component(&TuixHostWeb.Layouts.app/1,
        flash: %{},
        current_scope: %{user: %{id: "alice", email: "alice@example.test"}},
        inner_block: []
      )

    assert html =~ "data-tuix-phoenix="
    # The adapter passes the email, so the hash signs it too (identify v2).
    assert html =~
             Base.encode16(:crypto.mac(:hmac, :sha256, secret, "alice\nalice@example.test"),
               case: :lower
             )

    refute html =~ secret

    page = get(conn, "/") |> html_response(200)
    asset = TuixPhoenix.Assets.bootstrap()
    assert page =~ asset.url
    assert page =~ asset.integrity
    assert get(build_conn(), asset.url).status == 200
  end
end
