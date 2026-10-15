<?php
/**
 * Resolves the hosted widget runtime: an immutable, SRI-pinned loader URL.
 *
 * @package Tuix
 */

defined( 'ABSPATH' ) || exit;

/**
 * The Tuix server publishes its current widget build at /widget/channels/stable.json.
 * The plugin checks it server-side, caches it briefly and keeps the last good answer,
 * so a Tuix outage never slows or breaks page rendering.
 */
final class Tuix_Feedback_Runtime {
	const TTL          = 300;
	const LAST_OPTION  = 'tuix_feedback_runtime_last';
	const LOADER_PATH  = '#\A/widget/(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?)/[a-f0-9]{64}/tuix\.js\z#';
	const SRI          = '#\Asha384-[A-Za-z0-9+/]{64}\z#';

	/**
	 * Loader for an API origin, or null when none is available.
	 *
	 * Pages never wait on Tuix once a loader is known: an expired cache serves the
	 * last good loader and refreshes in the background (WP-Cron). Only the very first
	 * lookup is synchronous, and a failure is remembered for a minute so an
	 * unreachable address cannot delay every page.
	 *
	 * @param string $origin Validated API origin.
	 * @param bool   $fresh  Fetch now (connection checks).
	 * @return array{url:string,integrity:string,version:string}|null
	 */
	public static function loader( $origin, $fresh = false ) {
		$key = self::cache_key( $origin );
		if ( ! $fresh ) {
			$cached = get_transient( $key );
			if ( is_array( $cached ) ) {
				return $cached;
			}
			$last = self::last( $origin );
			if ( null !== $last ) {
				self::schedule_refresh( $origin );
				return $last;
			}
			if ( 'unavailable' === $cached ) {
				return null;
			}
		}
		return self::refresh( $origin );
	}

	/** Fetches now and records the result. Also the WP-Cron handler. */
	public static function refresh( $origin ) {
		$loader = self::fetch( $origin );
		if ( null === $loader ) {
			set_transient( self::cache_key( $origin ), 'unavailable', 60 );
			return self::last( $origin );
		}
		set_transient( self::cache_key( $origin ), $loader, self::TTL );
		$last            = get_option( self::LAST_OPTION, array() );
		$last            = is_array( $last ) ? $last : array();
		$last[ $origin ] = $loader;
		update_option( self::LAST_OPTION, $last, false );
		return $loader;
	}

	/** Registers the background refresh handler. */
	public static function register() {
		add_action( 'tuix_feedback_refresh_runtime', array( __CLASS__, 'refresh' ) );
	}

	private static function schedule_refresh( $origin ) {
		if ( ! wp_next_scheduled( 'tuix_feedback_refresh_runtime', array( $origin ) ) ) {
			wp_schedule_single_event( time(), 'tuix_feedback_refresh_runtime', array( $origin ) );
		}
		// Until the refresh runs, do not re-check on every page.
		set_transient( self::cache_key( $origin ), self::last( $origin ), 60 );
	}

	private static function last( $origin ) {
		$last = get_option( self::LAST_OPTION, array() );
		return is_array( $last ) && isset( $last[ $origin ] ) && is_array( $last[ $origin ] ) ? $last[ $origin ] : null;
	}

	private static function cache_key( $origin ) {
		return 'tuix_feedback_runtime_' . md5( $origin );
	}

	/**
	 * Validates a stable.json document.
	 *
	 * @param mixed  $manifest Decoded JSON.
	 * @param string $origin   API origin.
	 * @return array{url:string,integrity:string,version:string}|null
	 */
	public static function parse( $manifest, $origin ) {
		if ( ! is_array( $manifest ) || 1 !== ( $manifest['protocol'] ?? null ) || ! isset( $manifest['loader'] ) || ! is_array( $manifest['loader'] ) ) {
			return null;
		}
		$url       = $manifest['loader']['url'] ?? null;
		$integrity = $manifest['loader']['integrity'] ?? null;
		if ( ! is_string( $url ) || ! is_string( $integrity ) || ! preg_match( self::LOADER_PATH, $url, $match ) || ! preg_match( self::SRI, $integrity ) ) {
			return null;
		}
		if ( ( $manifest['version'] ?? null ) !== $match[1] ) {
			return null;
		}
		return array(
			'url'       => $origin . $url,
			'integrity' => $integrity,
			'version'   => $match[1],
		);
	}

	/**
	 * Fetches and validates the manifest.
	 *
	 * @param string $origin API origin.
	 */
	private static function fetch( $origin ) {
		$response = wp_remote_get(
			$origin . '/widget/channels/stable.json',
			array(
				'timeout'     => 5,
				'redirection' => 0,
				'headers'     => array( 'Accept' => 'application/json' ),
			)
		);
		if ( is_wp_error( $response ) || 200 !== (int) wp_remote_retrieve_response_code( $response ) ) {
			return null;
		}
		$body = wp_remote_retrieve_body( $response );
		if ( strlen( $body ) > 16384 ) {
			return null;
		}
		return self::parse( json_decode( $body, true ), $origin );
	}
}
