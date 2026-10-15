# Build the gem and run Rails integration tests against a temporary installation.
require "bundler/setup"
require "rubygems/package"
require "rubygems/installer"
require "fileutils"
require "tmpdir"
require "open3"

root = File.expand_path("..", __dir__)
package = File.join(root, "packages/rails")
output = File.join(root, "output/releases")
FileUtils.mkdir_p(output)

Dir.mktmpdir("tuix-rails-package") do |temporary|
  artifact = Dir.chdir(package) do
    specification = Gem::Specification.load("tuix_rails.gemspec")
    Gem::Package.build(specification, false, false, File.join(temporary, "#{specification.full_name}.gem"))
  end
  archive = Gem::Package.new(artifact)
  archive.verify
  raise "Packaged gem must contain the bootstrap" unless archive.contents.include?("assets/bootstrap.js")
  raise "Unexpected file in gem" unless archive.contents.all? { |name|
    name.start_with?("lib/") || %w[assets/bootstrap.js README.md LICENSE].include?(name)
  }
  gem_home = File.join(temporary, "gems")
  installed = Gem::Installer.at(artifact, install_dir: gem_home, ignore_dependencies: true,
    wrappers: false).install
  dependencies = Gem.loaded_specs.values.map(&:base_dir).uniq
  environment = { "GEM_HOME" => gem_home, "GEM_PATH" => ([gem_home] + dependencies).join(File::PATH_SEPARATOR),
    "TUIX_RAILS_PACKAGE_ROOT" => installed.full_gem_path,
    "TUIX_RAILS_TEST_RAILS_VERSION" => Gem.loaded_specs.fetch("railties").version.to_s }
  stdout, stderr, status = Bundler.with_unbundled_env do
    Open3.capture3(environment, RbConfig.ruby, File.join(package, "test/integration_test.rb"), chdir: temporary)
  end
  puts stdout
  warn stderr unless stderr.empty?
  abort "Packaged Rails integration failed" unless status.success?
  destination = File.join(output, File.basename(artifact))
  FileUtils.cp(artifact, destination)
  puts "Verified gem: #{destination}"
  puts "Local artifact only; not published to RubyGems."
end
