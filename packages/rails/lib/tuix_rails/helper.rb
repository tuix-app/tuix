require_relative "assets"

module TuixRails
  # A component name the widget accepts (`data-tuix-component`).
  COMPONENT_NAME = /\A[A-Za-z_][A-Za-z0-9_.:\/-]{0,99}\z/

  module Helper
    def tuix_assets(nonce: content_security_policy_nonce)
      path = "#{request.script_name}#{Assets::PATH}"
      content_tag(:script, "", src: path, defer: true, integrity: Assets::INTEGRITY,
        crossorigin: "anonymous", nonce: nonce, data: { turbo_track: "reload" })
    end

    def tuix_widget(user:, nonce: content_security_policy_nonce)
      payload = TuixRails.payload(user, nonce: nonce)
      # Action View escapes JSON as attribute text, including quotes and HTML.
      content_tag(:div, "", id: "tuix-rails", hidden: true,
        data: { tuix_rails: payload && JSON.generate(payload), turbo_temporary: true })
    end

    # Names the component a feedback report is about. Returns a hash for tag
    # helpers (`tag.form **tuix_component`, `tag.attributes(tuix_component)`):
    # `{ data: { tuix_component: "orders/_form" } }`. Without an argument the name
    # is the virtual path of the template being rendered (`orders/_form`,
    # `layouts/application`); pass a String for any other
    # explicit name. In a ViewComponent call `helpers.tuix_component(self.class.name)`.
    #
    # Returns `{}` (renders no attribute) when there is no name or the widget
    # would ignore it. It never raises in a view.
    def tuix_component(name = nil)
      name = name.nil? ? tuix_template_path : name
      name = name.to_s if name.is_a?(Symbol)
      return {} unless name.is_a?(String) && name.valid_encoding? && name.match?(TuixRails::COMPONENT_NAME)
      { data: { tuix_component: name } }
    end

    private

    # `@virtual_path` is the template Action View is rendering right now: each
    # compiled template sets it on entry and `ActionView::Base#_run` restores the
    # caller's value on exit, so it is right inside nested partials and after
    # they return. It is the same ivar Rails' own `t(".key")` lookup reads.
    def tuix_template_path
      @virtual_path
    end
  end
end
