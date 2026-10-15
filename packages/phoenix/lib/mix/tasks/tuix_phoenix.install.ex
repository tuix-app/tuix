if Code.ensure_loaded?(Igniter) do
  defmodule Mix.Tasks.TuixPhoenix.Install do
    @shortdoc "Installs tuix assets, Phoenix layout integration and runtime configuration"
    @moduledoc """
    Installs tuix into a Phoenix application using reviewable Igniter changes.

        mix igniter.install tuix_phoenix@path:/absolute/path/to/tuix/packages/phoenix

    Use `--web MyAppWeb` to select a nonstandard web module and `--dry-run` to
    inspect changes. Configure the generated `MyAppWeb.Tuix.identity/1` function
    when the host does not use Phoenix's `current_scope.user` convention.
    """
    use Igniter.Mix.Task

    @impl true
    def info(_, _) do
      %Igniter.Mix.Task.Info{group: :tuix_phoenix, schema: [web: :string]}
    end

    @impl true
    def igniter(igniter) do
      web =
        case igniter.args.options[:web] do
          nil -> Igniter.Libs.Phoenix.web_module(igniter)
          name -> Igniter.Project.Module.parse(name)
        end

      TuixPhoenix.Installer.install(igniter, web)
    end
  end
else
  defmodule Mix.Tasks.TuixPhoenix.Install do
    use Mix.Task
    @shortdoc "Installs tuix using Igniter"
    def run(_) do
      Mix.raise(
        "Install Igniter first, then use the local-path installation command in the package README."
      )
    end
  end
end
