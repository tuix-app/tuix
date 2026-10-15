defmodule TuixPhoenix.Plug do
  @moduledoc "Serves the widget assets bundled with tuix_phoenix. Install before the endpoint's router."
  @behaviour Plug

  @impl true
  def init(_opts) do
    Plug.Static.init(
      at: "/tuix-assets",
      from: {:tuix_phoenix, "priv/static"},
      gzip: true,
      cache_control_for_etags: "public, max-age=31536000, immutable"
    )
  end

  @impl true
  def call(conn, opts), do: Plug.Static.call(conn, opts)
end
