defmodule TuixPhoenix.MixProject do
  use Mix.Project

  def project do
    [
      app: :tuix_phoenix,
      version: "0.2.0",
      elixir: "~> 1.15",
      description: "Phoenix integration and Igniter installation for the tuix feedback widget",
      deps: deps(),
      package: [
        files: ~w(lib priv mix.exs README.md LICENSE THIRD_PARTY_NOTICES.md),
        licenses: ["MIT"],
        links: %{
          "GitHub" => "https://github.com/tuix-app/tuix/tree/main/packages/phoenix",
          "Website" => "https://tuix.app"
        }
      ],
      aliases: [check: ["format --check-formatted", "compile --warnings-as-errors", "test"]]
    ]
  end

  def cli, do: [preferred_envs: [check: :test]]

  def application, do: [extra_applications: [:crypto, :logger]]

  defp deps do
    [
      {:phoenix_live_view, "~> 1.0"},
      {:plug, "~> 1.15"},
      {:jason, "~> 1.4"},
      {:igniter, "~> 0.8", optional: true}
    ]
  end
end
