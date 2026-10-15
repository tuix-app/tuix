defmodule TuixPhoenix.Assets do
  @moduledoc false
  @manifest Path.expand("../../priv/manifest.json", __DIR__)
  @external_resource @manifest
  @assets if(File.exists?(@manifest), do: Jason.decode!(File.read!(@manifest)), else: %{})

  def bootstrap, do: asset!("bootstrap")
  def loader, do: asset!("loader")

  defp asset!(name) do
    case @assets[name] do
      %{"path" => path, "integrity" => integrity} ->
        %{url: "/tuix-assets/" <> path, integrity: integrity}

      _ ->
        raise "tuix_phoenix package is missing built widget assets; rebuild the package before installation"
    end
  end
end
