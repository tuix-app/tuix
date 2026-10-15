require "digest"
require "base64"

module TuixRails
  module Assets
    BODY = File.binread(File.expand_path("../../assets/bootstrap.js", __dir__)).freeze
    PATH = "/tuix-rails/#{Digest::SHA256.hexdigest(BODY)}/bootstrap.js".freeze
    INTEGRITY = "sha384-#{Base64.strict_encode64(Digest::SHA384.digest(BODY))}".freeze
  end

  # Serve exactly one public asset; no filesystem path comes from the request.
  class Middleware
    def initialize(app)
      @app = app
    end

    def call(env)
      return @app.call(env) unless env["PATH_INFO"] == Assets::PATH && %w[GET HEAD].include?(env["REQUEST_METHOD"])
      headers = {
        "content-type" => "text/javascript; charset=utf-8",
        "content-length" => Assets::BODY.bytesize.to_s,
        "cache-control" => "public, max-age=31536000, immutable",
        "x-content-type-options" => "nosniff",
        "cross-origin-resource-policy" => "same-origin"
      }
      [200, headers, env["REQUEST_METHOD"] == "HEAD" ? [] : [Assets::BODY]]
    end
  end
end
