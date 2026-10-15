<?php
/**
 * Prints the widget for signed-in users in the chosen roles.
 *
 * @package Tuix
 */

defined( 'ABSPATH' ) || exit;

/**
 * The widget only ever runs for an identified WordPress user. Their ID (and their
 * email, when sent) is signed here with the server-only key (HMAC-SHA256), so
 * visitors cannot impersonate them and Tuix can trust the email for sign-in.
 */
final class Tuix_Feedback_Widget {
	/** Hooks the output into the front end and, optionally, wp-admin. */
	public static function register() {
		add_action( 'wp_footer', array( __CLASS__, 'render' ), 20 );
		add_action( 'admin_footer', array( __CLASS__, 'render_admin' ), 20 );
	}

	/** Admin screens only when enabled in settings. */
	public static function render_admin() {
		if ( Tuix_Feedback_Config::get()['admin'] ) {
			self::render();
		}
	}

	/** Whether the current user should get the widget. */
	public static function visible_for( $user ) {
		if ( ! $user instanceof WP_User || ! $user->exists() ) {
			return false;
		}
		// Never for accounts that cannot work in wp-admin, whatever the settings or filters say.
		if ( ! user_can( $user, Tuix_Feedback_Config::REQUIRED_CAPABILITY ) ) {
			return false;
		}
		$allowed = (bool) array_intersect( (array) $user->roles, Tuix_Feedback_Config::get()['roles'] );
		if ( is_multisite() && is_super_admin( $user->ID ) && in_array( 'administrator', Tuix_Feedback_Config::get()['roles'], true ) ) {
			$allowed = true;
		}
		/**
		 * Filters whether the Tuix widget loads for a wp-admin user. It can narrow
		 * access further; it cannot extend it to accounts without wp-admin access.
		 *
		 * @param bool    $allowed Result of the role setting.
		 * @param WP_User $user    Signed-in user who can work in wp-admin.
		 */
		return (bool) apply_filters( 'tuix_should_load', $allowed, $user );
	}

	/**
	 * Signed identity for a user. The ID is the WordPress user ID, stable across
	 * renames; filters may change name or email but never add the hash themselves.
	 *
	 * Without an email the hash signs the ID. With one it signs the ID, a newline
	 * and the trimmed, lowercased email (Tuix identify v2): only a signed email
	 * lets the person open the Tuix dashboard from the widget and sign in.
	 *
	 * @param WP_User $user   Signed-in user.
	 * @param string  $secret Signing key.
	 */
	public static function identity( $user, $secret ) {
		$identity = array(
			'id'    => (string) $user->ID,
			'name'  => self::name( $user->display_name, $user->user_login ),
			'email' => $user->user_email,
		);
		/**
		 * Filters the identity sent to Tuix (name, email). The ID stays the user ID.
		 *
		 * @param array   $identity id, name, email.
		 * @param WP_User $user     Signed-in user.
		 */
		$filtered         = apply_filters( 'tuix_identity', $identity, $user );
		$identity['name'] = isset( $filtered['name'] ) && is_string( $filtered['name'] ) ? self::name( $filtered['name'], $user->user_login ) : $identity['name'];
		if ( array_key_exists( 'email', (array) $filtered ) ) {
			$email             = $filtered['email'];
			$identity['email'] = is_string( $email ) && is_email( $email ) ? $email : null;
		}
		if ( is_string( $identity['email'] ) ) {
			$identity['email'] = trim( $identity['email'] );
		}
		if ( ! is_email( (string) $identity['email'] ) ) {
			unset( $identity['email'] );
		}
		if ( isset( $identity['email'] ) ) {
			// Unicode lowercasing (mbstring), as the Tuix server does for the v2 message.
			$lowered = function_exists( 'mb_strtolower' ) ? mb_strtolower( $identity['email'], 'UTF-8' ) : strtolower( $identity['email'] );
			$message = $identity['id'] . "\n" . $lowered;
		} else {
			$message = $identity['id'];
		}
		$identity['hash'] = hash_hmac( 'sha256', $message, $secret );
		return $identity;
	}

	/** Tuix accepts names up to 200 bytes; cut on a character boundary, never empty. */
	private static function name( $name, $fallback ) {
		$name = trim( wp_strip_all_tags( (string) $name ) );
		$name = '' === $name ? (string) $fallback : $name;
		return strlen( $name ) <= 200 ? $name : rtrim( mb_strcut( $name, 0, 200, 'UTF-8' ) );
	}

	/** Prints the queue stub, configuration and SRI-pinned loader. */
	public static function render() {
		$user = wp_get_current_user();
		if ( ! self::visible_for( $user ) || array() !== Tuix_Feedback_Config::problems() ) {
			return;
		}
		$settings = Tuix_Feedback_Config::get();
		$origin   = Tuix_Feedback_Config::api_origin( $settings['api_url'] );
		$loader   = Tuix_Feedback_Runtime::loader( $origin );
		if ( null === $loader ) {
			return;
		}
		$options = array(
			'project'     => $settings['project_key'],
			'api'         => $origin,
			'environment' => $settings['environment'],
			'lang'        => 0 === strpos( get_user_locale( $user ), 'pl' ) ? 'pl' : 'en',
		);
		$flags   = JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_UNESCAPED_SLASHES;
		$script  = 'window.tuix=window.tuix||function(){(tuix.q=tuix.q||[]).push(arguments)};'
			. 'tuix("init",' . wp_json_encode( $options, $flags ) . ');'
			. 'tuix("identify",' . wp_json_encode( self::identity( $user, Tuix_Feedback_Config::secret() ), $flags ) . ');';
		// Both helpers pass through wp_*_script_attributes, so CSP nonce plugins apply.
		wp_print_inline_script_tag( $script, array( 'id' => 'tuix-init' ) );
		wp_print_script_tag(
			array(
				'id'          => 'tuix-loader',
				'src'         => $loader['url'],
				'integrity'   => $loader['integrity'],
				'crossorigin' => 'anonymous',
				'async'       => true,
			)
		);
	}
}
