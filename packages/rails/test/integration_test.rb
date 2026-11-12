if ENV["TUIX_RAILS_PACKAGE_ROOT"]
  gem "railties", ENV.fetch("TUIX_RAILS_TEST_RAILS_VERSION")
  gem "minitest", "~> 5.0"
else
  require "bundler/setup"
end
require "minitest/autorun"
require "rails"
require "action_controller/railtie"
require "tuix_rails"
require "rack/mock"
require "nokogiri"
require "tmpdir"
require "fileutils"

if ENV["TUIX_RAILS_PACKAGE_ROOT"]
  expected = File.realpath(ENV.fetch("TUIX_RAILS_PACKAGE_ROOT")) + "/lib/tuix_rails.rb"
  abort "Package smoke loaded source checkout instead of packaged gem" unless $LOADED_FEATURES.any? { |path|
    path.end_with?("/tuix_rails.rb") && File.realpath(path) == expected
  }
end

class TuixTestApp < Rails::Application
  config.eager_load = false
  config.secret_key_base = "test-" * 20
  config.hosts.clear
  config.action_dispatch.show_exceptions = :none
  config.logger = Logger.new(File::NULL)
  config.content_security_policy_nonce_generator = ->(_request) { "host-nonce" }
end

class TuixHostController < ActionController::Base
  def index
    render inline: '<head><%= tuix_assets %></head><body><%= tuix_widget(user: {id: 42, name: "Ada", email: "ada@example.com"}) %></body>'
  end
end

TuixTestApp.initialize!

# Templates for the component-name helper, in a real view path.
TUIX_VIEWS = Dir.mktmpdir("tuix-views")
Minitest.after_run { FileUtils.remove_entry(TUIX_VIEWS) if File.directory?(TUIX_VIEWS) }
{
  "layouts/application.html.erb" => <<~ERB,
    <html><body id="layout" <%= tag.attributes(tuix_component) %>><%= yield %></body></html>
  ERB
  "orders/show.html.erb" => <<~ERB,
    <div id="show-before" <%= tag.attributes(tuix_component) %>></div>
    <%= render "orders/form" %>
    <div id="show-after" <%= tag.attributes(tuix_component) %>></div>
    <%= render partial: "orders/item", collection: [1, 2] %>
    <%= render layout: "orders/box" do %><b id="in-block" <%= tag.attributes(tuix_component) %>></b><% end %>
    <p id="explicit" <%= tag.attributes(tuix_component("Checkout.Button")) %>></p>
    <p id="invalid" <%= tag.attributes(tuix_component("has space")) %>></p>
  ERB
  "orders/_form.html.erb" => <<~ERB,
    <%= tag.form class: "f", id: "form", **tuix_component do %>
      <%= render "orders/field" %>
      <i id="form-after-field" <%= tag.attributes(tuix_component) %>></i>
    <% end %>
  ERB
  "orders/_field.html.erb" => <<~ERB,
    <input id="field" <%= tag.attributes(tuix_component) %>>
  ERB
  "orders/_item.html.erb" => <<~ERB,
    <li class="item" id="item-<%= item_counter %>" <%= tag.attributes(tuix_component) %>></li>
  ERB
  "orders/_box.html.erb" => <<~ERB,
    <section id="box" <%= tag.attributes(tuix_component) %>><%= yield %></section>
  ERB
}.each do |path, source|
  full = File.join(TUIX_VIEWS, path)
  FileUtils.mkdir_p(File.dirname(full))
  File.write(full, source)
end

class TuixOrdersController < ActionController::Base
  prepend_view_path TUIX_VIEWS
  layout "application"

  def show
    render "orders/show"
  end

  def bare
    render inline: "<%= raw [tuix_component, tuix_component(:Sym), tuix_component(5)].to_json %>"
  end
end
TuixTestApp.routes.draw do
  get "/", to: "tuix_host#index"
  get "/orders", to: "tuix_orders#show"
  get "/bare", to: "tuix_orders#bare"
end

class TuixRailsTest < Minitest::Test
  SECRET = "test-secret-" * 4

  def setup
    TuixRails.configure do |config|
      config.project = "public-project"
      config.secret = SECRET
      config.api = "https://tuix.example.test"
      config.environment = "uat"
      config.release = nil
    end
  end

  def test_identity_protocol_and_normalized_verified_email
    user = { id: 42, name: "Ada", email: "  ADA@example.com  " }
    signed = TuixRails.identity(user)
    assert_equal "ada@example.com", signed[:email]
    assert_equal OpenSSL::HMAC.hexdigest("SHA256", SECRET, "42\nada@example.com"), signed[:hash]
    assert_equal "  ADA@example.com  ", user[:email]
    assert_equal OpenSSL::HMAC.hexdigest("SHA256", SECRET, "42"), TuixRails.identity({ id: 42, name: "Ada" })[:hash]
    assert_nil TuixRails.identity(nil)
  end

  def test_shared_identity_vectors_match_node_and_phoenix
    vectors = JSON.parse(File.read(File.expand_path("../../test-fixtures/identity-signing.json", __dir__)))
    vectors.fetch("cases").each do |vector|
      user = vector.fetch("user").transform_keys(&:to_sym)
      actual = TuixRails.identity(user, secret: vectors.fetch("secret")).transform_keys(&:to_s)
      assert_equal vector.fetch("signed"), actual, vector.fetch("label")
    end
  end

  def test_invalid_identities_and_origins
    [{ id: "", name: "Ada" }, { id: {}, name: "Ada" }, { id: 1, name: " " },
      { id: 1, name: "Ada", email: "bad\n@example.com" }].each do |user|
      assert_raises(ArgumentError) { TuixRails.identity(user) }
    end
    assert_raises(ArgumentError) { TuixRails.identity({ id: 1, name: "Ada" }, secret: "short") }
    %w[http://example.com https://u:p@example.com https://example.com/path https://example.com/?q=1 https://example.com/#x javascript:alert(1)].each do |url|
      assert_raises(ArgumentError) { TuixRails.api_origin(url) }
    end
    assert_equal "http://localhost:4000", TuixRails.api_origin("http://localhost:4000/")
  end

  def test_disabled_or_anonymous_payload_is_absent
    assert_nil TuixRails.payload(nil)
    TuixRails.configuration.secret = nil
    assert_nil TuixRails.payload({ id: 42, name: "Ada" })
  end

  def test_helper_escapes_identity_and_never_renders_secret
    view = ActionView::Base.empty
    name = '\"><script>alert(1)</script>'
    html = view.tuix_widget(user: { id: 42, name: name }, nonce: "test-nonce")
    fragment = Nokogiri::HTML.fragment(html)
    assert_empty fragment.css("script")
    node = fragment.at_css("#tuix-rails")
    assert node.key?("data-turbo-temporary")
    payload = JSON.parse(node["data-tuix-rails"])
    assert_equal name, payload.dig("user", "name")
    assert_equal "test-nonce", payload.dig("options", "nonce")
    refute_includes html, SECRET
  end

  def test_real_rails_render_and_public_asset
    client = Rack::MockRequest.new(TuixTestApp)
    response = client.get("/")
    assert_equal 200, response.status
    document = Nokogiri::HTML(response.body)
    script = document.at_css("script")
    assert_equal TuixRails::Assets::PATH, script["src"]
    assert_equal "reload", script["data-turbo-track"]
    assert_equal "42", JSON.parse(document.at_css("#tuix-rails")["data-tuix-rails"]).dig("user", "id")
    asset = client.get(script["src"])
    assert_equal 200, asset.status
    assert_equal "sha384-#{Base64.strict_encode64(Digest::SHA384.digest(asset.body))}", script["integrity"]
    assert_includes asset["cache-control"], "immutable"
    assert_equal "nosniff", asset["x-content-type-options"]
    assert_empty client.head(script["src"]).body
  end

  def test_middleware_does_not_serve_arbitrary_files_or_post
    middleware = TuixRails::Middleware.new(->(_env) { [418, {}, []] })
    ["/tuix-rails/../lib/tuix_rails.rb", "/tuix-rails/unknown/bootstrap.js"].each do |path|
      assert_equal 418, middleware.call("PATH_INFO" => path, "REQUEST_METHOD" => "GET")[0]
    end
    assert_equal 418, middleware.call("PATH_INFO" => TuixRails::Assets::PATH, "REQUEST_METHOD" => "POST")[0]
  end

  def test_generator_is_discoverable_and_preserves_existing_configuration
    require "rails/generators"
    generator = Rails::Generators.find_by_namespace("tuix:install")
    refute_nil generator
    if ENV["TUIX_RAILS_PACKAGE_ROOT"]
      expected = File.realpath(File.join(ENV.fetch("TUIX_RAILS_PACKAGE_ROOT"), "lib/generators/tuix/install_generator.rb"))
      assert $LOADED_FEATURES.any? { |path| path.end_with?("/tuix/install_generator.rb") && File.realpath(path) == expected },
        "Generator must load from the installed gem"
    end
    Dir.mktmpdir("tuix-generator") do |directory|
      generator.start([], destination_root: directory, shell: Thor::Shell::Basic.new)
      path = File.join(directory, "config/initializers/tuix.rb")
      assert_includes File.read(path), 'ENV["TUIX_SECRET_KEY"]'
      File.write(path, "# customized\n")
      generator.start(["--skip"], destination_root: directory)
      assert_equal "# customized\n", File.read(path)
    end
  end

  def test_mount_prefix_and_csp_nonce_follow_the_host_request
    client = Rack::MockRequest.new(TuixTestApp)
    response = client.get("/", "SCRIPT_NAME" => "/preview", "action_dispatch.content_security_policy_nonce" => "host-nonce")
    document = Nokogiri::HTML(response.body)
    script = document.at_css("script")
    assert_equal "/preview#{TuixRails::Assets::PATH}", script["src"]
    assert_equal "host-nonce", script["nonce"]
    payload = JSON.parse(document.at_css("#tuix-rails")["data-tuix-rails"])
    assert_equal "host-nonce", payload.dig("options", "nonce")
  end

  def test_unsupported_configuration_and_invalid_encoded_identities_fail_early
    TuixRails.configuration.environment = "UPPER"
    assert_raises(ArgumentError) { TuixRails.payload({ id: 42, name: "Ada" }) }
    TuixRails.configuration.environment = "uat"
    TuixRails.configuration.release = "x" * 201
    assert_raises(ArgumentError) { TuixRails.payload({ id: 42, name: "Ada" }) }
    assert_raises(ArgumentError) { TuixRails.identity({ id: "\xff".force_encoding("UTF-8"), name: "Ada" }) }
  end

  def components_page
    Nokogiri::HTML(Rack::MockRequest.new(TuixTestApp).get("/orders").tap { |r| assert_equal 200, r.status }.body)
  end

  def component_of(document, selector)
    document.at_css(selector)["data-tuix-component"]
  end

  def test_component_names_follow_the_template_through_partials_and_back
    document = components_page
    assert_equal "layouts/application", component_of(document, "#layout")
    assert_equal "orders/show", component_of(document, "#show-before")
    assert_equal "orders/_form", component_of(document, "#form")
    assert_equal "orders/_field", component_of(document, "#field")
    assert_equal "orders/_form", component_of(document, "#form-after-field")
    assert_equal "orders/show", component_of(document, "#show-after")
  end

  def test_component_names_in_collections_and_explicit_and_invalid_names
    document = components_page
    assert_equal ["orders/_item"] * 2, document.css("li.item").map { |node| node["data-tuix-component"] }
    assert_equal "Checkout.Button", component_of(document, "#explicit")
    assert_nil document.at_css("#invalid")["data-tuix-component"]
    assert_equal "orders/show", component_of(document, "#show-after")
  end

  def test_component_name_inside_a_layout_partial_is_the_partial
    assert_equal "orders/_box", component_of(components_page, "#box")
  end

  def test_component_name_of_a_block_given_to_a_layout_partial
    # Known limitation, documented in the README: the block is written in
    # orders/show but runs inside the partial, so the partial is current.
    assert_equal "orders/_box", component_of(components_page, "#in-block")
  end

  def test_component_helper_without_a_template_or_with_odd_names_renders_nothing
    view = ActionView::Base.empty
    assert_equal({}, view.tuix_component)
    assert_equal({ data: { tuix_component: "Sym" } }, view.tuix_component(:Sym))
    [5, "", " ", "has space", "9lives", "a\"b", "<script>", "x" * 101, "ok\n", "\xff".dup.force_encoding("UTF-8"),
      Object.new, ["a"]].each do |name|
      assert_equal({}, view.tuix_component(name), name.inspect)
    end
    assert_equal({ data: { tuix_component: "x" * 100 } }, view.tuix_component("x" * 100))
    assert_equal({ data: { tuix_component: "A.b:c/d-e_f" } }, view.tuix_component("A.b:c/d-e_f"))
    response = Rack::MockRequest.new(TuixTestApp).get("/bare")
    # An inline template has no virtual path.
    assert_equal [{}, { "data" => { "tuix_component" => "Sym" } }, {}], JSON.parse(response.body)
  end

  def test_component_attribute_renders_in_both_erb_forms_and_escapes_nothing_unsafe
    view = ActionView::Base.empty
    assert_equal '<form class="f" data-tuix-component="orders/_form"></form>',
      view.tag.form(class: "f", **view.tuix_component("orders/_form"))
    assert_equal 'data-tuix-component="orders/_form"', view.tag.attributes(view.tuix_component("orders/_form"))
    assert_equal "", view.tag.attributes(view.tuix_component("\"><script>alert(1)</script>"))
    assert_equal '<form class="f"></form>', view.tag.form(class: "f", **view.tuix_component("a b"))
  end
end
