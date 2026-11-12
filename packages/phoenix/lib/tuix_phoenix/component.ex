defmodule TuixPhoenix.Component do
  @moduledoc """
  Names a component for the tuix feedback widget.

  The widget reads `data-tuix-component="Name"` from a reported element and its
  ancestors. `tuix_component/0` writes that attribute for you, with a name taken
  from the module and function it is used in, so a report says which component
  it is about. Import it once, in the `html_helpers` of `MyAppWeb` (importing
  both arities in a module that uses only one gives an unused-import warning):

      import TuixPhoenix.Component, only: [tuix_component: 0, tuix_component: 1]

  and use it as a dynamic attribute list on the component's root tag:

      def button(assigns) do
        ~H"\""
        <button class="btn" {tuix_component()}>{render_slot(@inner_block)}</button>
        "\""
      end

  In `MyAppWeb.CoreComponents` that renders
  `data-tuix-component="MyAppWeb.CoreComponents.button"`. In a LiveView or
  LiveComponent `render/1` the name is the module alone (`MyAppWeb.OrderLive`).
  Pass a name to choose your own: `tuix_component("Checkout.Button")`.

  The name is worked out when your module compiles: the macro expands to a
  literal attribute list, which LiveView 1.1.23 and later keep in the template's
  static part, so nothing is added to a LiveView diff. A name the widget would ignore
  (it must match `#{inspect("^[A-Za-z_][A-Za-z0-9_.:/-]{0,99}$")}`) raises a
  `CompileError` asking for an explicit name. A name that is not a
  literal is checked when the template renders; if invalid it renders no
  attribute and never raises.

  Only public Phoenix and Elixir API is used. In a function that cannot be named
  (for example a module body) give an explicit name.
  """

  @pattern ~r/\A[A-Za-z_][A-Za-z0-9_.:\/-]{0,99}\z/

  @doc """
  Attribute list naming the component after the module and function it is used
  in (the module alone inside `render/1`).
  """
  defmacro tuix_component do
    name = derived_name!(__CALLER__)
    validate_literal!(name, __CALLER__, true)
    attrs(name)
  end

  @doc """
  Attribute list with an explicit name. A literal string is validated at compile
  time; any other expression is validated when it renders.
  """
  defmacro tuix_component(name) do
    if is_binary(name) do
      validate_literal!(name, __CALLER__, false)
      attrs(name)
    else
      quote do: TuixPhoenix.Component.component_attrs(unquote(name))
    end
  end

  @doc false
  # Runtime form for names that are not literals: never raises.
  def component_attrs(name) when is_binary(name) do
    if valid?(name), do: [{"data-tuix-component", name}], else: []
  end

  def component_attrs(name) when is_atom(name) and name not in [nil, true, false],
    do: component_attrs(Atom.to_string(name))

  def component_attrs(_), do: []

  @doc false
  def valid?(name) when is_binary(name), do: Regex.match?(@pattern, name)
  def valid?(_), do: false

  defp attrs(name), do: [{"data-tuix-component", name}]

  defp derived_name!(%Macro.Env{module: nil} = env), do: not_derivable!(env)

  defp derived_name!(%Macro.Env{module: module, function: function} = env) do
    case function do
      {:render, _arity} -> inspect(module)
      {name, _arity} -> inspect(module) <> "." <> Atom.to_string(name)
      nil -> not_derivable!(env)
    end
  end

  defp not_derivable!(env) do
    raise CompileError,
      file: env.file,
      line: env.line,
      description:
        "tuix_component() needs to be called inside a function of a module; " <>
          "pass a name instead, for example tuix_component(\"Checkout.Button\")"
  end

  defp validate_literal!(name, env, derived?) do
    unless valid?(name) do
      advice =
        if derived?,
          do: "the name derived from the module and function does not fit; ",
          else: ""

      raise CompileError,
        file: env.file,
        line: env.line,
        description:
          "invalid tuix component name #{inspect(name)}: #{advice}a name starts with a letter or " <>
            "underscore, continues with letters, digits and _ . : / - and has at most 100 " <>
            "characters. Pass an explicit name, for example tuix_component(\"Checkout.Button\")"
    end
  end
end
