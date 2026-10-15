require "json"
require "openssl"
require "uri"
require_relative "tuix_rails/version"

module TuixRails
  class Configuration
    attr_accessor :project, :secret, :api, :environment, :release

    def initialize
      @project = ENV["TUIX_PROJECT_KEY"]
      @secret = ENV["TUIX_SECRET_KEY"]
      @api = ENV.fetch("TUIX_API_URL", "https://tuix.app")
      @environment = ENV.fetch("TUIX_ENVIRONMENT", "uat")
    end
  end

  def self.configuration
    @configuration ||= Configuration.new
  end

  def self.configure
    yield configuration
  end

  def self.validate_text!(value, field, limit)
    unless value.is_a?(String) && value.valid_encoding? && value.bytesize.between?(1, limit) && !value.strip.empty?
      raise ArgumentError, "invalid Tuix #{field}"
    end
    value
  end

  # Only pass trusted, authenticated host identities, with verified emails.
  def self.identity(user, secret: configuration.secret)
    return nil if user.nil?
    raise ArgumentError, "Tuix user must be a hash with :id and :name" unless user.is_a?(Hash)
    id = user[:id].is_a?(Integer) ? user[:id].to_s : user[:id]
    validate_text!(id, :id, 200)
    validate_text!(user[:name], :name, 200)
    unless secret.is_a?(String) && secret.bytesize >= 32
      raise ArgumentError, "Tuix project secret must be at least 32 bytes"
    end
    email = user[:email]
    unless email.nil?
      validate_text!(email, :email, 254)
      email = email.strip.downcase
      raise ArgumentError, "invalid Tuix email" unless email.match?(/\A[^\s@]+@[^\s@]+\.[^\s@]+\z/)
    end
    message = email ? "#{id}\n#{email}" : id
    result = { id: id, name: user[:name], hash: OpenSSL::HMAC.hexdigest("SHA256", secret, message) }
    result[:email] = email if email
    result
  end

  def self.api_origin(value)
    validate_text!(value, :api, 2048)
    url = URI.parse(value)
    unless url.is_a?(URI::HTTP) && url.host && !url.host.empty? && !url.userinfo && !url.query && !url.fragment &&
        ["", "/"].include?(url.path) && url.port.between?(1, 65_535) &&
        (url.scheme == "https" || %w[localhost 127.0.0.1].include?(url.host))
      raise ArgumentError, "Tuix API must be an HTTPS origin (HTTP is allowed on localhost)"
    end
    value.delete_suffix("/")
  rescue URI::InvalidURIError
    raise ArgumentError, "invalid Tuix API origin"
  end

  def self.payload(user, nonce: nil)
    config = configuration
    return nil if user.nil? || [config.project, config.secret, config.api].any? { |value| value.nil? || value == "" }
    validate_text!(config.project, :project, 128)
    unless config.environment.is_a?(String) && config.environment.match?(/\A[a-z][a-z0-9_-]{0,39}\z/)
      raise ArgumentError, "invalid Tuix environment"
    end
    options = { project: config.project, api: api_origin(config.api), environment: config.environment, nonce: nonce }
    options[:release] = validate_text!(config.release, :release, 200) if config.release
    { options: options, user: identity(user), delivery: "hosted" }
  end
end

require_relative "tuix_rails/railtie" if defined?(Rails::Railtie)
