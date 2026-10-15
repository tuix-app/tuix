<?php
/**
 * Settings storage and validation. The signing key never reaches the browser.
 *
 * @package Tuix
 */

defined( 'ABSPATH' ) || exit;

/**
 * Reads and validates plugin settings. Each value can be pinned in wp-config.php
 * (TUIX_API_URL, TUIX_PROJECT_KEY, TUIX_SECRET_KEY, TUIX_ENVIRONMENT), which then
 * wins over the settings screen; the signing key is best kept there.
 */
final class Tuix_Feedback_Config {
	const OPTION        = 'tuix_feedback_settings';
	const SECRET_OPTION = 'tuix_feedback_secret_key';
	const DEFAULT_API   = 'https://tuix.app';

	/**
	 * Current settings with defaults and wp-config overrides applied.
	 *
	 * @return array{api_url:string,project_key:string,environment:string,roles:string[],admin:bool}
	 */
	public static function get() {
		$stored   = get_option( self::OPTION, array() );
		$stored   = is_array( $stored ) ? $stored : array();
		$settings = array(
			'api_url'     => isset( $stored['api_url'] ) ? (string) $stored['api_url'] : self::DEFAULT_API,
			'project_key' => isset( $stored['project_key'] ) ? (string) $stored['project_key'] : '',
			'environment' => isset( $stored['environment'] ) ? (string) $stored['environment'] : self::default_environment(),
			'roles'       => isset( $stored['roles'] ) && is_array( $stored['roles'] ) ? array_values( array_map( 'strval', $stored['roles'] ) ) : array( 'administrator', 'editor' ),
			'admin'       => ! empty( $stored['admin'] ),
		);
		foreach ( array(
			'api_url'     => 'TUIX_API_URL',
			'project_key' => 'TUIX_PROJECT_KEY',
			'environment' => 'TUIX_ENVIRONMENT',
		) as $key => $constant ) {
			if ( defined( $constant ) ) {
				$settings[ $key ] = (string) constant( $constant );
			}
		}
		return $settings;
	}

	/** Tuix only admits localhost origins in the local environment. */
	public static function default_environment() {
		$host = wp_parse_url( home_url(), PHP_URL_HOST );
		return in_array( $host, array( 'localhost', '127.0.0.1' ), true ) ? 'local' : 'production';
	}

	/**
	 * Only people who work in wp-admin may comment: the capability every back-office
	 * role has (Contributor and up, Shop manager) and front-end accounts such as
	 * Subscriber or WooCommerce Customer lack.
	 */
	const REQUIRED_CAPABILITY = 'edit_posts';

	/**
	 * Roles that can be offered: those whose capabilities include wp-admin work.
	 *
	 * @return array<string,string> Role slug => display name.
	 */
	public static function eligible_roles() {
		$roles = array();
		foreach ( wp_roles()->roles as $slug => $role ) {
			if ( ! empty( $role['capabilities'][ self::REQUIRED_CAPABILITY ] ) ) {
				$roles[ $slug ] = $role['name'];
			}
		}
		return $roles;
	}

	/** Whether a setting is pinned in wp-config.php. */
	public static function pinned( $key ) {
		$constants = array(
			'api_url'     => 'TUIX_API_URL',
			'project_key' => 'TUIX_PROJECT_KEY',
			'environment' => 'TUIX_ENVIRONMENT',
			'secret'      => 'TUIX_SECRET_KEY',
		);
		return isset( $constants[ $key ] ) && defined( $constants[ $key ] );
	}

	/** Server-only signing key, from wp-config.php or the settings screen. */
	public static function secret() {
		if ( defined( 'TUIX_SECRET_KEY' ) ) {
			return (string) TUIX_SECRET_KEY;
		}
		$secret = get_option( self::SECRET_OPTION, '' );
		return is_string( $secret ) ? $secret : '';
	}

	/** Normalised API origin, or null when it is not a safe origin. */
	public static function api_origin( $value ) {
		$value = trim( (string) $value );
		$parts = wp_parse_url( $value );
		if ( ! is_array( $parts ) || empty( $parts['scheme'] ) || empty( $parts['host'] ) ) {
			return null;
		}
		foreach ( array( 'user', 'pass', 'query', 'fragment' ) as $forbidden ) {
			if ( isset( $parts[ $forbidden ] ) ) {
				return null;
			}
		}
		if ( isset( $parts['path'] ) && '/' !== $parts['path'] && '' !== $parts['path'] ) {
			return null;
		}
		$scheme = strtolower( $parts['scheme'] );
		$host   = strtolower( $parts['host'] );
		$local  = in_array( $host, array( 'localhost', '127.0.0.1' ), true );
		if ( 'https' !== $scheme && ! ( 'http' === $scheme && $local ) ) {
			return null;
		}
		return $scheme . '://' . $host . ( isset( $parts['port'] ) ? ':' . (int) $parts['port'] : '' );
	}

	/** Public project keys look like pk_live_… */
	public static function valid_project_key( $value ) {
		return 1 === preg_match( '/\Apk_[A-Za-z0-9_-]{8,120}\z/', (string) $value );
	}

	/** Environment names follow the Tuix API rule. */
	public static function valid_environment( $value ) {
		return 1 === preg_match( '/\A[a-z][a-z0-9_-]{0,39}\z/', (string) $value );
	}

	/** Missing settings that keep the widget off, as translated sentences. */
	public static function problems() {
		$settings = self::get();
		$problems = array();
		if ( null === self::api_origin( $settings['api_url'] ) ) {
			$problems[] = __( 'Set the Tuix address (HTTPS).', 'tuix-feedback' );
		}
		if ( ! self::valid_project_key( $settings['project_key'] ) ) {
			$problems[] = __( 'Add the public project key from Tuix → Project settings.', 'tuix-feedback' );
		}
		if ( '' === self::secret() ) {
			$problems[] = __( 'Add the server-only signing key from Tuix → Project settings.', 'tuix-feedback' );
		}
		if ( ! self::valid_environment( $settings['environment'] ) ) {
			$problems[] = __( 'Use a lowercase environment name such as production or uat.', 'tuix-feedback' );
		}
		return $problems;
	}
}
