require_relative "assets"

module TuixRails
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
  end
end
