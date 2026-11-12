<?php
/**
 * Plugin updates from tuix.app through WordPress's Updates screen.
 *
 * @package Tuix
 */

defined( 'ABSPATH' ) || exit;

/**
 * The plugin is distributed only from tuix.app, so its "Update URI" header points there
 * and WordPress takes its updates from there, not from wordpress.org. During its normal update checks (about
 * twice a day) WordPress calls the filter named after the URI's host, update_plugins_tuix.app.
 * We answer from the public file at that address; WordPress compares versions, shows the
 * update and, where the site enabled auto-updates, installs it.
 *
 * Nothing is sent beyond what WordPress's HTTP API sends by default, and any failure leaves
 * WordPress's answer unchanged, so the Updates screen never breaks.
 */
final class Tuix_Feedback_Updater {
	const URI     = 'https://tuix.app/downloads/tuix-feedback.json';
	const HOST    = 'tuix.app';
	const SLUG    = 'tuix-feedback';
	const VERSION = '#\A\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?\z#';
	const MAX     = 65536;

	/** Hooks WordPress's update check and the "View version details" window. */
	public static function register() {
		add_filter( 'update_plugins_' . self::HOST, array( __CLASS__, 'update' ), 10, 4 );
		add_filter( 'plugins_api', array( __CLASS__, 'information' ), 10, 3 );
	}

	/**
	 * Answers WordPress's update check for this plugin.
	 *
	 * @param array|false $update      The answer so far.
	 * @param array       $plugin_data Plugin headers.
	 * @param string      $plugin_file Plugin file relative to the plugins directory.
	 * @param string[]    $locales     Installed locales.
	 * @return array|false
	 */
	public static function update( $update, $plugin_data = array(), $plugin_file = '', $locales = array() ) {
		unset( $plugin_data, $locales );
		if ( plugin_basename( TUIX_FEEDBACK_FILE ) !== $plugin_file ) {
			return $update;
		}
		$release = self::release();
		if ( null === $release ) {
			return $update;
		}
		$answer = array(
			'id'      => self::URI,
			'slug'    => self::SLUG,
			'version' => $release['version'],
			'url'     => $release['url'],
			'package' => $release['package'],
		);
		foreach ( array( 'tested', 'requires', 'requires_php' ) as $key ) {
			if ( '' !== $release[ $key ] ) {
				$answer[ $key ] = $release[ $key ];
			}
		}
		return $answer;
	}

	/**
	 * Fills the "View version details" window instead of asking wordpress.org.
	 *
	 * @param false|object|array $result The answer so far.
	 * @param string             $action The request kind.
	 * @param object             $args   The request.
	 * @return false|object|array
	 */
	public static function information( $result, $action = '', $args = null ) {
		if ( 'plugin_information' !== $action || ! is_object( $args ) || ! isset( $args->slug ) || self::SLUG !== $args->slug ) {
			return $result;
		}
		$release = self::release();
		if ( null === $release ) {
			return $result;
		}
		$changelog = '';
		foreach ( $release['changelog'] as $line ) {
			$changelog .= '<li>' . esc_html( $line ) . '</li>';
		}
		$sections = array(
			'description' => '<p>' . esc_html__( 'Element-anchored feedback for your WordPress site. Signed-in team members point at anything on a page and leave a comment; you triage it in Tuix.', 'tuix-feedback' ) . '</p>',
		);
		if ( '' !== $changelog ) {
			$sections['changelog'] = '<ul>' . $changelog . '</ul>';
		}
		$info = array(
			'name'          => 'Tuix Feedback',
			'slug'          => self::SLUG,
			'version'       => $release['version'],
			'author'        => '<a href="https://tuix.app">Tuix</a>',
			'homepage'      => $release['url'],
			'download_link' => $release['package'],
			'sections'      => array_map( 'wp_kses_post', $sections ),
		);
		foreach ( array( 'tested', 'requires', 'requires_php' ) as $key ) {
			if ( '' !== $release[ $key ] ) {
				$info[ $key ] = $release[ $key ];
			}
		}
		return (object) $info;
	}

	/**
	 * The current release as tuix.app describes it, or null when the answer is missing or
	 * not exactly what we expect.
	 *
	 * @return array{version:string,package:string,url:string,tested:string,requires:string,requires_php:string,changelog:string[]}|null
	 */
	private static function release() {
		$response = wp_remote_get(
			self::URI,
			array(
				'timeout'             => 5,
				'redirection'         => 0,
				'limit_response_size' => self::MAX + 1,
				'headers'             => array( 'Accept' => 'application/json' ),
			)
		);
		if ( is_wp_error( $response ) || 200 !== (int) wp_remote_retrieve_response_code( $response ) ) {
			return null;
		}
		$body = wp_remote_retrieve_body( $response );
		if ( strlen( $body ) > self::MAX ) {
			return null;
		}
		$data = json_decode( $body, true );
		if ( ! is_array( $data ) || ! isset( $data['version'], $data['package'] ) || ! is_string( $data['version'] ) || ! is_string( $data['package'] ) ) {
			return null;
		}
		if ( ! preg_match( self::VERSION, $data['version'] ) || ! self::tuix_url( $data['package'] ) ) {
			return null;
		}
		$url = isset( $data['url'] ) && is_string( $data['url'] ) && self::tuix_url( $data['url'] ) ? $data['url'] : 'https://tuix.app';
		$out = array(
			'version'   => $data['version'],
			'package'   => $data['package'],
			'url'       => $url,
			'changelog' => array(),
		);
		foreach ( array( 'tested', 'requires', 'requires_php' ) as $key ) {
			$out[ $key ] = isset( $data[ $key ] ) && is_string( $data[ $key ] ) && preg_match( '#\A\d+(?:\.\d+){0,2}\z#', $data[ $key ] ) ? $data[ $key ] : '';
		}
		if ( isset( $data['changelog'] ) && is_array( $data['changelog'] ) ) {
			foreach ( array_slice( $data['changelog'], 0, 50 ) as $line ) {
				if ( is_string( $line ) && '' !== trim( $line ) ) {
					$out['changelog'][] = substr( trim( $line ), 0, 500 );
				}
			}
		}
		return $out;
	}

	/** Whether the address is plain https on tuix.app (no credentials, no port). */
	private static function tuix_url( $url ) {
		$parts = wp_parse_url( $url );
		return is_array( $parts )
			&& isset( $parts['scheme'], $parts['host'] )
			&& 'https' === $parts['scheme']
			&& self::HOST === $parts['host']
			&& ! isset( $parts['user'] )
			&& ! isset( $parts['pass'] )
			&& ! isset( $parts['port'] );
	}
}
