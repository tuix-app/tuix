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

  @doc "Renders current widget identity. Place inside the layout updated by LiveView."
  def widget(assigns) do
    assigns = assign(assigns, :payload, payload(assigns.user, assigns.nonce))

    ~H"""
    <div id="tuix-phoenix" hidden data-tuix-phoenix={@payload}></div>
    """
  end

  attr(:nonce, :string, default: nil)

  @doc "Loads the package's local integration script once in the root layout."
  def assets(assigns) do
    assigns = assign(assigns, :asset, TuixPhoenix.Assets.bootstrap())

    ~H"""
    <script
      defer
      phx-track-static
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

  Without an email the hash signs the exact ID. With an email it signs the ID, a
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

    %{id: id, name: name, hash: sign(secret, id, email)}
    |> then(&if(email, do: Map.put(&1, :email, email), else: &1))
  end

  def identity(_, _),
    do:
      raise(
        ArgumentError,
        "tuix user must be nil or a map with :id and :name; configure a project secret"
      )

  defp payload(user, nonce) do
    config = Application.get_all_env(:tuix_phoenix)

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
  defp sign(secret, id, nil), do: mac(secret, id)
  defp sign(secret, id, email), do: mac(secret, id <> "\n" <> String.downcase(email))

  defp mac(secret, message),
    do: :crypto.mac(:hmac, :sha256, secret, message) |> Base.encode16(case: :lower)

  defp optional_email(nil), do: nil

  defp optional_email(email) do
    validate_text!(email, :email, 254)
    email = String.trim(email)

    unless Regex.match?(~r/^[^\s@]+@[^\s@]+\.[^\s@]+$/, email),
      do: raise(ArgumentError, "invalid tuix email")

    email
  end
end
