require_relative "lib/tuix_rails/version"

Gem::Specification.new do |spec|
  spec.name = "tuix_rails"
  spec.version = TuixRails::VERSION
  spec.authors = ["Tuix"]
  spec.summary = "Signed Tuix feedback widget integration for Rails"
  spec.description = "Server-signed Tuix identities, hosted widget delivery and Turbo lifecycle integration for Rails applications."
  spec.homepage = "https://tuix.app"
  spec.license = "MIT"
  spec.required_ruby_version = ">= 3.2"
  spec.files = Dir["lib/**/*", "assets/bootstrap.js", "README.md", "LICENSE"]
  spec.require_paths = ["lib"]
  spec.metadata["homepage_uri"] = "https://tuix.app"
  spec.metadata["source_code_uri"] = "https://github.com/tuix-app/tuix/tree/main/packages/rails"
  spec.metadata["documentation_uri"] = "https://github.com/tuix-app/tuix/tree/main/packages/rails#readme"
  spec.metadata["bug_tracker_uri"] = "https://github.com/tuix-app/tuix/issues"
  spec.metadata["rubygems_mfa_required"] = "true"
  spec.add_dependency "railties", ">= 7.2", "< 9"
  spec.add_dependency "actionview", ">= 7.2", "< 9"
end
