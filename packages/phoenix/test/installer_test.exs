defmodule TuixPhoenix.InstallerTest do
  use ExUnit.Case, async: true
  import Igniter.Test

  defp project(kind) do
    files = %{
      "lib/demo_web/endpoint.ex" => """
      defmodule DemoWeb.Endpoint do
        use Phoenix.Endpoint, otp_app: :demo
        plug Plug.Static, at: "/", from: :demo
        plug DemoWeb.Router
      end
      """,
      "lib/demo_web/components/layouts/root.html.heex" =>
        "<html><head><title>Demo</title></head><body>{@inner_content}</body></html>",
      "lib/demo_web/components/layouts.ex" => """
      defmodule DemoWeb.Layouts do
        use Phoenix.Component
        def app(assigns) do
          ~H\"\"\"
          <main>{@inner_content}</main>
          \"\"\"
        end
      end
      """
    }

    files =
      if kind == :template,
        do:
          Map.put(
            files,
            "lib/demo_web/components/layouts/app.html.heex",
            "<main><%= @inner_content %></main>"
          ),
        else: files

    # Igniter 0.8.4's test-mode glob compares a relative pattern with absolute
    # fixture paths. Load declared files explicitly so this fixture actually
    # contains the same source tree as a Phoenix host; keep installer assertions.
    test_project(app_name: :demo, files: files) |> load_fixture()
  end

  defp load_fixture(igniter) do
    Enum.reduce(Map.keys(igniter.assigns.test_files), igniter, fn path, igniter ->
      Igniter.include_existing_file(igniter, path)
    end)
  end

  for kind <- [:inline, :template] do
    test "installs #{kind} layout and reruns without changing source" do
      installed = project(unquote(kind)) |> TuixPhoenix.Installer.install(DemoWeb)
      assert installed.issues == []
      diff = diff(installed)
      assert diff =~ "TuixPhoenix.Plug"
      assert diff =~ "TuixPhoenix.assets"
      assert diff =~ "TuixPhoenix.widget"
      assert diff =~ "TUIX_SECRET_KEY"
      assert diff =~ "current_scope"

      installed
      |> apply_igniter!()
      |> load_fixture()
      |> TuixPhoenix.Installer.install(DemoWeb)
      |> assert_unchanged()
    end
  end

  test "custom root layout produces actionable issue" do
    result =
      project(:inline)
      |> Igniter.update_file(
        "lib/demo_web/components/layouts/root.html.heex",
        &Rewrite.Source.update(&1, :content, "<main />")
      )
      |> TuixPhoenix.Installer.install(DemoWeb)
      |> apply_igniter()

    assert {:error, issues} = result
    assert Enum.any?(issues, &String.contains?(to_string(&1), "Cannot identify one closing head"))
  end

  test "preserves environment configuration and a customized identity adapter" do
    config =
      "import Config\nif config_env() == :test do\n  config :tuix_phoenix, project: \"existing\"\nend\n"

    adapter = "defmodule DemoWeb.Tuix do\n  def identity(%{account: account}), do: account\nend\n"

    installed =
      project(:inline)
      |> Igniter.create_new_file("config/custom.exs", config)
      |> Igniter.create_new_file("lib/demo_web/tuix.ex", adapter)
      |> apply_igniter!()
      |> load_fixture()
      |> TuixPhoenix.Installer.install(DemoWeb)

    assert installed.issues == []
    refute diff(installed) =~ "TUIX_SECRET_KEY"
    assert_unchanged(installed, ["config/custom.exs", "lib/demo_web/tuix.ex"])
  end

  test "an unrelated existing adapter module produces an actionable issue" do
    installed =
      project(:inline)
      |> Igniter.create_new_file(
        "lib/demo_web/tuix.ex",
        "defmodule DemoWeb.Tuix do\n def unrelated, do: :ok\nend\n"
      )
      |> apply_igniter!()
      |> load_fixture()
      |> TuixPhoenix.Installer.install(DemoWeb)

    assert Enum.any?(installed.issues, &String.contains?(&1, "already exists without identity/1"))
  end
end
