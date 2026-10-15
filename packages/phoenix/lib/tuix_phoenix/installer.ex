if Code.ensure_loaded?(Igniter) do
  defmodule TuixPhoenix.Installer do
    @moduledoc false
    alias Igniter.Code.Common
    alias Sourceror.Zipper

    def install(igniter, web) do
      layouts = Module.concat(web, Layouts)
      adapter = Module.concat(web, Tuix)

      {igniter, layout_path} =
        case Igniter.Project.Module.find_module(igniter, layouts) do
          {:ok, {igniter, source, _zipper}} -> {igniter, source.path}
          {:error, igniter} -> {igniter, Igniter.Project.Module.proper_location(igniter, layouts)}
        end

      root = Path.join(Path.rootname(layout_path), "root.html.heex")
      app = Path.join(Path.rootname(layout_path), "app.html.heex")

      identity =
        "<TuixPhoenix.widget user={#{inspect(adapter)}.identity(assigns)} nonce={assigns[:csp_nonce]} />"

      igniter
      |> endpoint(Module.concat(web, Endpoint))
      |> root_layout(root)
      |> app_layout(layouts, app, identity)
      |> adapter(adapter)
      |> runtime_config()
      |> Igniter.add_notice(
        "Set TUIX_PROJECT_KEY, TUIX_API_URL and TUIX_SECRET_KEY. Allow this host origin in tuix and enable signed identity. Review #{inspect(adapter)}.identity/1 for your authentication model. The widget stays inactive until configured and signed in. See the tuix_phoenix README for CSP requirements."
      )
    end

    defp endpoint(igniter, endpoint) do
      update_module(igniter, endpoint, fn zipper ->
        if contains?(Zipper.node(zipper), &plug?(&1, [:TuixPhoenix, :Plug])) do
          {:ok, zipper}
        else
          case Common.move_to(zipper, &match?({:plug, _, _}, Zipper.node(&1))) do
            {:ok, plug} ->
              {:ok, Common.add_code(plug, "plug TuixPhoenix.Plug", placement: :before)}

            :error ->
              {:error,
               "No endpoint plug found in #{inspect(endpoint)}. Add TuixPhoenix.Plug before the router."}
          end
        end
      end)
    end

    defp root_layout(igniter, path) do
      Igniter.update_file(igniter, path, fn source ->
        text = Rewrite.Source.get(source, :content)

        cond do
          String.contains?(text, "<TuixPhoenix.assets") ->
            source

          length(Regex.scan(~r/<\/head\s*>/, text)) == 1 ->
            updated =
              Regex.replace(
                ~r/<\/head\s*>/,
                text,
                "  <TuixPhoenix.assets nonce={assigns[:csp_nonce]} />\n  </head>"
              )

            Rewrite.Source.update(source, :content, updated)

          true ->
            {:error,
             "Cannot identify one closing head in #{path}. Add <TuixPhoenix.assets nonce={assigns[:csp_nonce]} /> to the root layout."}
        end
      end)
    end

    defp app_layout(igniter, layouts, template, identity) do
      if Igniter.exists?(igniter, template) do
        Igniter.update_file(igniter, template, fn source ->
          text = Rewrite.Source.get(source, :content)

          if String.contains?(text, "<TuixPhoenix.widget"),
            do: source,
            else: Rewrite.Source.update(source, :content, identity <> "\n" <> text)
        end)
      else
        update_module(igniter, layouts, fn zipper ->
          {node, count} =
            Macro.prewalk(Zipper.node(zipper), 0, fn
              {:def, _, [{:app, _, [_]}, _]} = node, count ->
                {changed, found} = inject_component(node, identity)
                {changed, count + found}

              node, count ->
                {node, count}
            end)

          if count > 0,
            do: {:ok, Zipper.replace(zipper, node)},
            else:
              {:error,
               "No app/1 HEEx layout found in #{inspect(layouts)}. Add #{identity} to the layout rendered by your LiveViews."}
        end)
      end
    end

    defp inject_component(node, identity) do
      Macro.prewalk(node, 0, fn
        {:sigil_H, meta, [{:<<>>, string_meta, [text]}, modifiers]}, count when is_binary(text) ->
          text =
            if String.contains?(text, "<TuixPhoenix.widget"),
              do: text,
              else: identity <> "\n" <> text

          {{:sigil_H, meta, [{:<<>>, string_meta, [text]}, modifiers]}, count + 1}

        node, count ->
          {node, count}
      end)
    end

    defp adapter(igniter, module) do
      source = """
      defmodule #{inspect(module)} do
        @moduledoc "Maps the authenticated host user to tuix. Customize for your application's authentication."

        def identity(%{current_scope: %{user: user}}), do: user_identity(user)
        def identity(_assigns), do: nil

        defp user_identity(%{id: id} = user) when not is_nil(id) do
          name = Map.get(user, :name) || Map.get(user, :email) || to_string(id)
          %{id: to_string(id), name: name, email: Map.get(user, :email)}
        end

        defp user_identity(_), do: nil
      end
      """

      case Igniter.Project.Module.find_module(igniter, module) do
        {:ok, {igniter, _source, zipper}} ->
          if contains?(Zipper.node(zipper), fn
               {:def, _, [{:identity, _, [_]} | _]} -> true
               {:def, _, [{:when, _, [{:identity, _, [_]} | _]} | _]} -> true
               _ -> false
             end) do
            igniter
          else
            Igniter.add_issue(
              igniter,
              "#{inspect(module)} already exists without identity/1. Add your identity adapter there before installing."
            )
          end

        {:error, igniter} ->
          Igniter.create_new_file(
            igniter,
            Igniter.Project.Module.proper_location(igniter, module),
            source
          )
      end
    end

    defp runtime_config(igniter) do
      igniter = Igniter.include_glob(igniter, "config/**/*.exs")

      existing =
        Enum.any?(igniter.rewrite.sources, fn {path, source} ->
          String.starts_with?(path, "config/") and
            match?(
              {:ok, _},
              Common.move_to(Zipper.zip(Rewrite.Source.get(source, :quoted)), fn zipper ->
                (Igniter.Code.Function.function_call?(zipper, :config, 2) or
                   Igniter.Code.Function.function_call?(zipper, :config, 3)) and
                  Igniter.Code.Function.argument_equals?(zipper, 0, :tuix_phoenix)
              end)
            )
        end)

      if existing do
        Igniter.add_notice(
          igniter,
          "Existing :tuix_phoenix configuration preserved. Review its project, api, secret and environment settings; no runtime defaults were added."
        )
      else
        add_runtime_config(igniter)
      end
    end

    defp add_runtime_config(igniter) do
      Enum.reduce(
        [
          project: "TUIX_PROJECT_KEY",
          api: "TUIX_API_URL",
          secret: "TUIX_SECRET_KEY",
          environment: "TUIX_ENVIRONMENT"
        ],
        igniter,
        fn {key, env}, igniter ->
          value =
            if key == :environment,
              do: quote(do: System.get_env(unquote(env), "uat")),
              else: quote(do: System.get_env(unquote(env)))

          Igniter.Project.Config.configure_new(
            igniter,
            "runtime.exs",
            :tuix_phoenix,
            [key],
            {:code, value}
          )
        end
      )
    end

    defp update_module(igniter, module, fun) do
      case Igniter.Project.Module.find_and_update_module(igniter, module, fun) do
        {:ok, igniter} ->
          igniter

        {:error, igniter} ->
          Igniter.add_issue(
            igniter,
            "Could not find #{inspect(module)}. Select your Phoenix web module with --web MyAppWeb."
          )
      end
    end

    defp contains?(node, predicate) do
      {_, found} =
        Macro.prewalk(node, false, fn node, found -> {node, found or predicate.(node)} end)

      found
    end

    defp plug?({:plug, _, [{:__aliases__, _, aliases} | _]}, aliases), do: true
    defp plug?(_, _), do: false
  end
end
