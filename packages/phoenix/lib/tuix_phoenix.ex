defmodule TuixPhoenix do
  @moduledoc """
  Phoenix components for the tuix feedback widget.

  Configure `:tuix_phoenix` with `:project`, `:api`, `:secret` and `:environment`.
  The secret signs identity on the server and is never serialized to the browser.
  The installer adds the asset plug, bootstrap script and identity component.
  """
  use Phoenix.Component

  attr(:user, :any, default: nil)
  attr(:nonce, :string, default: nil)

  attr(:config, :map,
    default: nil,
    doc:
      "Per-render configuration (`%{project, api, secret, environment}`, optionally `delivery`) that replaces the `:tuix_phoenix` application environment for this render."
  )

  @doc """
  Renders current widget identity. Place inside the layout updated by LiveView.

  Without `config` the `:tuix_phoenix` application environment is read. With
  it, that map is used instead, so one app can render several projects (for
  example the project of the workspace in view). The secret stays on the server.
  """
  def widget(assigns) do
    assigns = assign(assigns, :payload, payload(assigns.user, assigns.nonce, assigns.config))

    ~H"""
    <div id="tuix-phoenix" hidden data-tuix-phoenix={@payload}></div>
    """
  end

  attr(:nonce, :string, default: nil)

  @doc """
  Loads the package's local integration script once in the root layout.

  It carries no `phx-track-static`: the script is not in the host's digest
  manifest, so `static_changed?/1` would always report a change and a host that
  reloads on it would reload forever. The content hash in its path busts caches.
  """
  def assets(assigns) do
    assigns = assign(assigns, :asset, TuixPhoenix.Assets.bootstrap())

    ~H"""
    <script
      defer
      src={@asset.url}
      integrity={@asset.integrity}
      crossorigin="anonymous"
      nonce={@nonce}
    >
    </script>
    """
  end

  @doc """
  Signs an explicit `%{id: ..., name: ...}` identity (optionally with `:email`)
  using the configured server secret.

  With a `:group` (and optionally `:group_name`) the hash is v3: it signs
  `"v3"`, the ID, the email (empty without one), the group and its name (empty
  without one), separated by newlines, so a person can neither move into
  another group nor relabel theirs. The group is 1-200 bytes and the ID may not
  hold a newline. A project that keeps groups apart needs one ID per group.

  Without a group and without an email the hash signs the exact ID. With an email it signs the ID, a
  newline and the trimmed, lowercased email (identify v2), so Tuix knows the
  email is the host's: only a signed email lets the person open the Tuix
  dashboard from the widget and sign in.
  """
  def identity(nil, _secret), do: nil

  def identity(%{id: id, name: name} = user, secret) when is_binary(secret) do
    id = if is_integer(id), do: Integer.to_string(id), else: id
    validate_text!(id, :id, 200)
    validate_text!(name, :name, 200)

    if byte_size(secret) < 32,
      do: raise(ArgumentError, "tuix project secret must be at least 32 bytes")

    email = optional_email(Map.get(user, :email))
    {group, group_name} = optional_group(id, Map.get(user, :group), Map.get(user, :group_name))

    %{id: id, name: name, hash: sign(secret, id, email, group, group_name)}
    |> then(&if(email, do: Map.put(&1, :email, email), else: &1))
    |> then(&if(group, do: Map.put(&1, :group, group), else: &1))
    |> then(&if(group_name, do: Map.put(&1, :group_name, group_name), else: &1))
  end

  def identity(_, _),
    do:
      raise(
        ArgumentError,
        "tuix user must be nil or a map with :id and :name; configure a project secret"
      )

  defp payload(user, nonce, override) do
    config =
      if override, do: override_config!(override), else: Application.get_all_env(:tuix_phoenix)

    if config[:project] && config[:api] && config[:secret] do
      validate_text!(config[:project], :project, 128)
      api = valid_api!(config[:api])
      environment = config[:environment] || "uat"

      unless is_binary(environment) and Regex.match?(~r/^[a-z][a-z0-9_-]{0,39}$/, environment),
        do: raise(ArgumentError, "invalid tuix environment")

      delivery = config[:delivery] || :hosted

      unless delivery in [:hosted, :bundled],
        do: raise(ArgumentError, "tuix delivery must be :hosted or :bundled")

      Jason.encode!(%{
        options: %{project: config[:project], api: api, environment: environment, nonce: nonce},
        user: identity(user, config[:secret]),
        delivery: delivery,
        loader: if(delivery == :bundled, do: TuixPhoenix.Assets.loader(), else: nil)
      })
    end
  end

  # A per-render config replaces the environment, so it must be complete: a
  # missing key raises (naming the key, never a value) instead of rendering nothing.
  @config_keys [:project, :api, :secret, :environment, :delivery]
  defp override_config!(override) when is_map(override) do
    config =
      for key <- @config_keys,
          value = Map.get(override, key, Map.get(override, Atom.to_string(key))),
          value != nil,
          do: {key, value}

    for key <- [:project, :api, :secret],
        config[key] == nil,
        do: raise(ArgumentError, "tuix widget config is missing #{inspect(key)}")

    config
  end

  defp override_config!(_), do: raise(ArgumentError, "tuix widget config must be a map")

  defp valid_api!(value) when is_binary(value) do
    validate_text!(value, :api, 2048)

    case URI.new(value) do
      {:ok,
       %URI{scheme: scheme, host: host, userinfo: nil, query: nil, fragment: nil, path: path}}
      when is_binary(host) and host != "" and path in [nil, "", "/"] ->
        if scheme == "https" or (scheme == "http" and host in ["localhost", "127.0.0.1"]) do
          String.trim_trailing(value, "/")
        else
          raise ArgumentError, "tuix API must use HTTPS (HTTP is allowed on localhost)"
        end

      _ ->
        raise ArgumentError, "tuix API must be an origin without credentials, query or fragment"
    end
  end

  defp valid_api!(_), do: raise(ArgumentError, "tuix API must be a URL")

  defp validate_text!(value, field, limit) do
    unless is_binary(value) and String.valid?(value) and byte_size(value) in 1..limit and
             String.trim(value) != "" do
      raise ArgumentError, "invalid tuix #{field}"
    end
  end

  # v1 signs the ID; v2 (with an email) the ID, a newline and the normalised email.
  # v3 (with a group) signs "v3", the ID, the email, the group and its name, newline-separated.
  defp sign(secret, id, nil, nil, _), do: mac(secret, id)
  defp sign(secret, id, email, nil, _), do: mac(secret, id <> "\n" <> String.downcase(email))

  defp sign(secret, id, email, group, group_name),
    do:
      mac(
        secret,
        Enum.join(["v3", id, String.downcase(email || ""), group, group_name || ""], "\n")
      )

  defp mac(secret, message),
    do: :crypto.mac(:hmac, :sha256, secret, message) |> Base.encode16(case: :lower)

  defp optional_group(id, group, ""), do: optional_group(id, group, nil)
  defp optional_group(_id, nil, nil), do: {nil, nil}
  defp optional_group(_id, nil, _), do: raise(ArgumentError, "tuix group_name needs a group")

  defp optional_group(id, group, group_name) do
    validate_text!(group, :group, 200)
    group_name = if group_name == "", do: nil, else: group_name
    if group_name, do: validate_text!(group_name, :group_name, 200)

    if String.contains?(id, "\n"), do: raise(ArgumentError, "invalid tuix id")

    for {field, value} <- [group: group, group_name: group_name],
        value != nil and Regex.match?(~r/\p{Cc}/u, value),
        do: raise(ArgumentError, "invalid tuix #{field}")

    {group, group_name}
  end

  defp optional_email(nil), do: nil

  defp optional_email(email) do
    validate_text!(email, :email, 254)
    email = String.trim(email)

    unless Regex.match?(~r/^[^\s@]+@[^\s@]+\.[^\s@]+$/, email),
      do: raise(ArgumentError, "invalid tuix email")

    email
  end
end
