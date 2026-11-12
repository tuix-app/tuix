defmodule TuixPhoenix.ComponentTest do
  use ExUnit.Case, async: true
  import Phoenix.Component
  import Phoenix.LiveViewTest

  alias Phoenix.LiveView.Rendered

  defmodule Components do
    use Phoenix.Component
    import TuixPhoenix.Component, only: [tuix_component: 0, tuix_component: 1]

    def button(assigns) do
      ~H"""
      <button class="btn" {tuix_component()}>{render_slot(@inner_block)}</button>
      """
    end

    attr(:rest, :global)

    def global(assigns) do
      ~H"""
      <div id="g" class="c" {tuix_component()} {@rest}>global</div>
      """
    end

    def explicit(assigns) do
      ~H"""
      <i {tuix_component("Checkout.Button")}>x</i>
      """
    end

    def dynamic(assigns) do
      ~H"""
      <i {tuix_component(@name)}>x</i>
      """
    end

    embed_templates("templates/*")
  end

  defmodule OrderLive do
    use Phoenix.LiveView
    import TuixPhoenix.Component, only: [tuix_component: 0]

    def render(assigns) do
      ~H"""
      <main {tuix_component()}>order</main>
      """
    end
  end

  defmodule Counter do
    use Phoenix.LiveComponent
    import TuixPhoenix.Component, only: [tuix_component: 0]

    def render(assigns) do
      ~H"""
      <div {tuix_component()}>counter</div>
      """
    end
  end

  defp statics(%Rendered{static: static}), do: Enum.join(static)
  defp assigns(map), do: Map.put(map, :__changed__, nil)

  test "a function component is named after its module and function" do
    html = render_component(&Components.button/1, inner_block: [])
    assert html =~ ~s(data-tuix-component="TuixPhoenix.ComponentTest.Components.button")
  end

  # LiveView 1.1.23 and later inline the literal list into the static text (the
  # installed version is one of those). Older ones keep it as a dynamic part
  # that depends on no assign, so it is sent once and never again in a diff.
  defp assert_not_in_diffs(%Rendered{} = rendered, name) do
    if String.contains?(statics(rendered), ~s(data-tuix-component="#{name}")) do
      refute inspect(rendered.dynamic.(false)) =~ "data-tuix-component"
    else
      assert rendered.dynamic.(true) |> Enum.all?(&is_nil/1)
    end
  end

  test "the attribute is part of the template's static text, not the diff" do
    inlined? =
      Version.match?(to_string(Application.spec(:phoenix_live_view, :vsn)), ">= 1.1.23")

    rendered = Components.explicit(assigns(%{}))

    if inlined? do
      assert statics(rendered) =~ ~s(data-tuix-component="Checkout.Button")
      assert rendered.dynamic.(false) == []

      rendered = Components.global(assigns(%{rest: %{}}))

      assert statics(rendered) =~
               ~s(data-tuix-component="TuixPhoenix.ComponentTest.Components.global")
    else
      assert inspect(rendered.dynamic.(false)) =~ "data-tuix-component"
    end
  end

  test "an unchanged render sends nothing for the attribute" do
    unchanged = %{__changed__: %{}, rest: %{}}
    assert_not_in_diffs(Components.explicit(unchanged), "Checkout.Button")

    assert_not_in_diffs(
      Components.global(unchanged),
      "TuixPhoenix.ComponentTest.Components.global"
    )

    assert_not_in_diffs(OrderLive.render(unchanged), "TuixPhoenix.ComponentTest.OrderLive")
  end

  test "an explicit name is used as given" do
    assert rendered_to_string(Components.explicit(assigns(%{}))) =~
             ~s(data-tuix-component="Checkout.Button")
  end

  test "it works with other attributes and global attributes" do
    html =
      rendered_to_string(Components.global(assigns(%{rest: %{"data-x": "1", class: "extra"}})))

    assert html =~ ~s(id="g")
    assert html =~ ~s(data-tuix-component="TuixPhoenix.ComponentTest.Components.global")
    assert html =~ ~s(data-x="1")
  end

  test "a LiveView render/1 uses the module alone" do
    assert render_component(&OrderLive.render/1, %{}) =~
             ~s(data-tuix-component="TuixPhoenix.ComponentTest.OrderLive")
  end

  test "a LiveComponent render/1 uses the module alone" do
    assert render_component(Counter, id: "c") =~
             ~s(data-tuix-component="TuixPhoenix.ComponentTest.Counter")
  end

  test "an embedded template is named after its generated function" do
    html = rendered_to_string(Components.card(assigns(%{title: "T", rest: %{}})))
    assert html =~ ~s(data-tuix-component="TuixPhoenix.ComponentTest.Components.card")
    assert html =~ "<section"

    assert rendered_to_string(Components.plain(assigns(%{}))) =~
             ~s(data-tuix-component="TuixPhoenix.ComponentTest.Components.plain")
  end

  test "a valid dynamic name renders and an invalid one renders nothing" do
    assert rendered_to_string(Components.dynamic(assigns(%{name: "Dyn.Name"}))) =~
             ~s(data-tuix-component="Dyn.Name")

    for bad <- ["", "9lives", "has space", String.duplicate("a", 101), nil, 42, "x\n"] do
      html = rendered_to_string(Components.dynamic(assigns(%{name: bad})))
      refute html =~ "data-tuix-component", inspect(bad)
      assert html =~ "<i"
    end

    assert TuixPhoenix.Component.component_attrs(String.duplicate("a", 100)) != []

    assert TuixPhoenix.Component.component_attrs(:Checkout) == [
             {"data-tuix-component", "Checkout"}
           ]

    assert TuixPhoenix.Component.component_attrs(nil) == []
    assert TuixPhoenix.Component.component_attrs(true) == []
  end

  test "an invalid literal name is a compile error" do
    for bad <- ["has space", "", "9x", String.duplicate("a", 101)] do
      assert_raise CompileError, ~r/invalid tuix component name/, fn ->
        Code.compile_string("""
        defmodule BadLiteral#{System.unique_integer([:positive])} do
          import TuixPhoenix.Component
          def f, do: tuix_component(#{inspect(bad)})
        end
        """)
      end
    end
  end

  test "a derived name that does not fit is a compile error asking for an explicit name" do
    long = String.duplicate("a", 100)

    error =
      assert_raise CompileError, fn ->
        Code.compile_string("""
        defmodule Long#{System.unique_integer([:positive])} do
          import TuixPhoenix.Component
          def #{long}, do: tuix_component()
        end
        """)
      end

    assert error.description =~ "Pass an explicit name"

    # A predicate function name cannot be a component name either.
    assert_raise CompileError, ~r/explicit name/, fn ->
      Code.compile_string("""
      defmodule Pred#{System.unique_integer([:positive])} do
        import TuixPhoenix.Component
        def ready?, do: tuix_component()
      end
      """)
    end
  end

  test "outside a function a name is required" do
    assert_raise CompileError, ~r/pass a name/, fn ->
      Code.compile_string("""
      defmodule NoFun#{System.unique_integer([:positive])} do
        import TuixPhoenix.Component
        @n tuix_component()
      end
      """)
    end
  end
end
