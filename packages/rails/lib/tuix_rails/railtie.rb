require_relative "helper"

module TuixRails
  class Railtie < Rails::Railtie
    initializer "tuix_rails.assets" do |app|
      app.middleware.use TuixRails::Middleware
    end

    initializer "tuix_rails.helpers" do
      ActiveSupport.on_load(:action_view) { include TuixRails::Helper }
    end
  end
end
