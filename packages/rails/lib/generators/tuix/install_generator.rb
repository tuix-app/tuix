require "rails/generators"

module Tuix
  class InstallGenerator < Rails::Generators::Base
    desc "Configure Tuix and print the layout integration steps"

    def create_configuration
      initializer "tuix.rb", <<~RUBY
        TuixRails.configure do |config|
          config.project = ENV["TUIX_PROJECT_KEY"]
          config.secret = ENV["TUIX_SECRET_KEY"]
          config.api = ENV.fetch("TUIX_API_URL", "https://tuix.app")
          config.environment = ENV.fetch("TUIX_ENVIRONMENT", "uat")
          # config.release = ENV["APP_REVISION"]
        end
      RUBY
    end

    def installation_steps
      say "Add <%= tuix_assets %> to your layout's <head>."
      say "Add <%= tuix_widget(user: your_authenticated_identity_or_nil) %> inside <body>."
      say "Use a hash with :id, :name and optional verified :email. Never use request parameters."
      say "See the gem README for Turbo cache, CSP and allowed-origin configuration."
    end
  end
end
