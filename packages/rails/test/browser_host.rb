# A loopback-only Rails fixture. Fixed routes select fictional test identities;
# production applications must derive identities from authenticated server state.
require "bundler/setup"
require "rails"
require "action_controller/railtie"
require "tuix_rails"
require "rackup/handler/webrick"

class TuixBrowserApp < Rails::Application
  config.eager_load = false
  config.secret_key_base = "browser-fixture-" * 8
  config.hosts = ["127.0.0.1"]
  config.logger = Logger.new(File::NULL)
  config.content_security_policy do |policy|
    policy.default_src :self
    policy.script_src :self, ENV.fetch("TUIX_API_URL")
    policy.style_src :self
    policy.style_src_attr :unsafe_inline
    policy.connect_src :self, ENV.fetch("TUIX_API_URL")
    policy.font_src :self, ENV.fetch("TUIX_API_URL")
    policy.img_src :self, :data, :blob
    policy.object_src :none
    policy.base_uri :none
  end
  # Stable only in this fixture to test Turbo visits under a single document CSP.
  config.content_security_policy_nonce_generator = ->(_request) { "rails-browser-fixture" }
  config.content_security_policy_nonce_directives = %w[script-src style-src]
end

class TuixBrowserController < ActionController::Base
  IDENTITIES = {
    "alice" => { id: "alice", name: "Alice", email: "alice@example.test" },
    "bob" => { id: "bob", name: "Bob", email: "bob@example.test" }
  }.freeze

  def index
    @identity = IDENTITIES[params[:user]]
    render inline: <<~ERB
      <!doctype html><html><head><title>Rails feedback fixture</title>
      <meta name="turbo-cache-control" content="no-cache">
      <%= csp_meta_tag %>
      <%= tuix_assets %>
      <script src="/turbo.js" type="module"></script></head><body>
      <h1>Rails host</h1>
      <nav><a id="alice" href="/alice" data-turbo-prefetch="false">Alice</a>
      <a id="bob" href="/bob" data-turbo-prefetch="false">Bob</a>
      <a id="logout" href="/signed-out" data-turbo-prefetch="false">Sign out</a></nav>
      <turbo-frame id="identity-frame">
        <%= tuix_widget(user: @identity) %>
        <a id="frame-bob" href="/bob" data-turbo-prefetch="false">Bob in frame</a>
      </turbo-frame></body></html>
    ERB
  end

  def turbo
    path = File.join(Gem::Specification.find_by_name("turbo-rails").full_gem_path, "app/assets/javascripts/turbo.min.js")
    send_data File.binread(path), type: "text/javascript", disposition: "inline"
  end
end

TuixBrowserApp.initialize!
TuixBrowserApp.routes.draw do
  get "/turbo.js", to: "tuix_browser#turbo"
  get "/:user", to: "tuix_browser#index"
end
Rackup::Handler::WEBrick.run(TuixBrowserApp, Host: "127.0.0.1", Port: 0,
  AccessLog: [], Logger: WEBrick::Log.new(File::NULL)) do |server|
  trap("TERM") { server.shutdown }
  puts "TUIX_RAILS_HOST=http://127.0.0.1:#{server.config[:Port]}"
  $stdout.flush
end
