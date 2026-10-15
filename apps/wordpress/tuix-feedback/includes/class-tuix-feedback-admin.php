<?php
/**
 * Settings → Tuix: configuration and a live connection check.
 *
 * @package Tuix
 */

defined( 'ABSPATH' ) || exit;

/** Settings screen, sanitisation and the connection check. */
final class Tuix_Feedback_Admin {
	const PAGE = 'tuix';

	/** Hooks. */
	public static function register() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'settings' ) );
		add_action( 'admin_post_tuix_feedback_check', array( __CLASS__, 'check' ) );
		add_action( 'admin_notices', array( __CLASS__, 'notice' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( TUIX_FEEDBACK_FILE ), array( __CLASS__, 'action_links' ) );
		add_action( 'added_option', array( __CLASS__, 'keep_secret_out_of_autoload' ) );
		add_action( 'updated_option', array( __CLASS__, 'keep_secret_out_of_autoload' ) );
	}

	/** The signing key is read only when printing the widget; never load it on every request. */
	public static function keep_secret_out_of_autoload( $option ) {
		if ( Tuix_Feedback_Config::SECRET_OPTION === $option && function_exists( 'wp_set_option_autoload' ) ) {
			wp_set_option_autoload( $option, false );
		}
	}

	/** Adds the page under Settings. */
	public static function menu() {
		add_options_page( __( 'Tuix feedback', 'tuix-feedback' ), __( 'Tuix', 'tuix-feedback' ), 'manage_options', self::PAGE, array( __CLASS__, 'page' ) );
	}

	/** "Settings" link on the Plugins screen. */
	public static function action_links( $links ) {
		array_unshift( $links, '<a href="' . esc_url( admin_url( 'options-general.php?page=' . self::PAGE ) ) . '">' . esc_html__( 'Settings', 'tuix-feedback' ) . '</a>' );
		return $links;
	}

	/** Registers the two options with their sanitisers. */
	public static function settings() {
		register_setting(
			self::PAGE,
			Tuix_Feedback_Config::OPTION,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( __CLASS__, 'sanitize' ),
				'default'           => array(),
			)
		);
		register_setting(
			self::PAGE,
			Tuix_Feedback_Config::SECRET_OPTION,
			array(
				'type'              => 'string',
				'sanitize_callback' => array( __CLASS__, 'sanitize_secret' ),
				'default'           => '',
			)
		);
	}

	/** Validates settings; invalid values keep the previous ones and explain why. */
	public static function sanitize( $input ) {
		// The first save runs sanitisers twice (update_option falls through to add_option).
		static $sanitized = null;
		if ( null !== $sanitized && $input === $sanitized ) {
			return $sanitized;
		}
		$previous = get_option( Tuix_Feedback_Config::OPTION, array() );
		$previous = is_array( $previous ) ? $previous : array();
		// options.php already unslashes submitted values.
		$input  = is_array( $input ) ? $input : array();
		$output = $previous;

		$origin = Tuix_Feedback_Config::api_origin( $input['api_url'] ?? '' );
		if ( Tuix_Feedback_Config::pinned( 'api_url' ) ) {
			// Pinned fields are disabled in the form and not submitted: keep what is stored.
			unset( $input['api_url'] );
		} elseif ( null === $origin ) {
			add_settings_error( Tuix_Feedback_Config::OPTION, 'api_url', __( 'The Tuix address must be an HTTPS origin such as https://tuix.app, without a path.', 'tuix-feedback' ) );
		} else {
			$output['api_url'] = $origin;
		}

		$key = trim( (string) ( $input['project_key'] ?? '' ) );
		if ( Tuix_Feedback_Config::pinned( 'project_key' ) ) {
			$key = null;
		} elseif ( '' === $key || Tuix_Feedback_Config::valid_project_key( $key ) ) {
			$output['project_key'] = $key;
		} else {
			add_settings_error( Tuix_Feedback_Config::OPTION, 'project_key', __( 'The project key starts with pk_. Copy it from Tuix → Project settings → Public project key.', 'tuix-feedback' ) );
		}

		$environment = strtolower( trim( (string) ( $input['environment'] ?? '' ) ) );
		if ( Tuix_Feedback_Config::pinned( 'environment' ) ) {
			$environment = null;
		} elseif ( Tuix_Feedback_Config::valid_environment( $environment ) ) {
			$output['environment'] = $environment;
		} else {
			add_settings_error( Tuix_Feedback_Config::OPTION, 'environment', __( 'Use a lowercase environment name such as production or uat.', 'tuix-feedback' ) );
		}

		$roles           = array_keys( Tuix_Feedback_Config::eligible_roles() );
		$chosen          = isset( $input['roles'] ) && is_array( $input['roles'] ) ? array_map( 'sanitize_key', $input['roles'] ) : array();
		$output['roles'] = array_values( array_intersect( $roles, $chosen ) );
		$output['admin'] = ! empty( $input['admin'] );
		$sanitized       = $output;
		return $output;
	}

	/** An empty submission keeps the stored key; it is never shown again. */
	public static function sanitize_secret( $input ) {
		$input = trim( (string) $input );
		if ( '' === $input ) {
			return (string) get_option( Tuix_Feedback_Config::SECRET_OPTION, '' );
		}
		if ( strlen( $input ) < 16 || strlen( $input ) > 256 || preg_match( '/\s/', $input ) ) {
			add_settings_error( Tuix_Feedback_Config::OPTION, 'secret', __( 'That signing key does not look right. Copy it from Tuix → Project settings → Server-only signing key.', 'tuix-feedback' ) );
			return (string) get_option( Tuix_Feedback_Config::SECRET_OPTION, '' );
		}
		return $input;
	}

	/** Reminds admins once, on the dashboard and plugins screens, until configured. */
	public static function notice() {
		$screen = get_current_screen();
		if ( ! current_user_can( 'manage_options' ) || ! $screen || ! in_array( $screen->id, array( 'dashboard', 'plugins' ), true ) || array() === Tuix_Feedback_Config::problems() ) {
			return;
		}
		printf(
			'<div class="notice notice-warning"><p>%s <a href="%s">%s</a></p></div>',
			esc_html__( 'Tuix Feedback is installed but not connected yet.', 'tuix-feedback' ),
			esc_url( admin_url( 'options-general.php?page=' . self::PAGE ) ),
			esc_html__( 'Finish setup', 'tuix-feedback' )
		);
	}

	/** Checks the manifest and a signed identify call exactly as the widget would. */
	public static function check() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You are not allowed to do that.', 'tuix-feedback' ), 403 );
		}
		check_admin_referer( 'tuix_feedback_check' );
		$result = self::connection();
		set_transient( 'tuix_feedback_check_' . get_current_user_id(), $result, 120 );
		wp_safe_redirect( admin_url( 'options-general.php?page=' . self::PAGE . '&tuix-checked=1' ) );
		exit;
	}

	/**
	 * Runs the connection check.
	 *
	 * @return array{ok:bool,message:string}
	 */
	public static function connection() {
		$problems = Tuix_Feedback_Config::problems();
		if ( array() !== $problems ) {
			return array(
				'ok'      => false,
				'message' => implode( ' ', $problems ),
			);
		}
		$settings = Tuix_Feedback_Config::get();
		$origin   = Tuix_Feedback_Config::api_origin( $settings['api_url'] );
		$loader   = Tuix_Feedback_Runtime::loader( $origin, true );
		if ( null === $loader ) {
			return array(
				'ok'      => false,
				/* translators: %s: Tuix address */
				'message' => sprintf( __( 'Could not reach Tuix at %s. Check the address and that this server can make outgoing HTTPS requests.', 'tuix-feedback' ), $origin ),
			);
		}
		$site     = wp_parse_url( home_url() );
		$site     = $site['scheme'] . '://' . $site['host'] . ( isset( $site['port'] ) ? ':' . $site['port'] : '' );
		$identity = Tuix_Feedback_Widget::identity( wp_get_current_user(), Tuix_Feedback_Config::secret() );
		$response = wp_remote_post(
			$origin . '/v1/identify',
			array(
				'timeout'     => 8,
				'redirection' => 0,
				'headers'     => array(
					'Content-Type'       => 'application/json',
					'Origin'             => $site,
					'X-Tuix-Project'     => $settings['project_key'],
					'X-Tuix-Environment' => $settings['environment'],
				),
				'body'        => wp_json_encode( $identity ),
			)
		);
		$code     = is_wp_error( $response ) ? 0 : (int) wp_remote_retrieve_response_code( $response );
		switch ( $code ) {
			case 200:
				/* translators: 1: widget version, 2: site origin */
				return array( 'ok' => true, 'message' => sprintf( __( 'Connected. Widget %1$s is ready for %2$s.', 'tuix-feedback' ), $loader['version'], $site ) );
			case 401:
				return array( 'ok' => false, 'message' => __( 'Tuix rejected the signature. Copy the signing key again from Tuix → Project settings → Server-only signing key.', 'tuix-feedback' ) );
			case 403:
				/* translators: %s: site origin */
				return array( 'ok' => false, 'message' => sprintf( __( 'Tuix refused this site. Check the project key, and add %s to Allowed origins in Tuix → Project settings. A site on localhost needs the environment local and the origin local.', 'tuix-feedback' ), $site ) );
			case 429:
				return array( 'ok' => false, 'message' => __( 'Tuix is rate limiting requests. Try again in a minute.', 'tuix-feedback' ) );
			default:
				return array( 'ok' => false, 'message' => __( 'Tuix did not accept the check. Try again, or check the Tuix address.', 'tuix-feedback' ) );
		}
	}

	/** Renders Settings → Tuix. */
	public static function page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$settings = Tuix_Feedback_Config::get();
		$check    = isset( $_GET['tuix-checked'] ) ? get_transient( 'tuix_feedback_check_' . get_current_user_id() ) : false; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- display only.
		$pinned   = __( 'Set in wp-config.php', 'tuix-feedback' );
		$has_key  = '' !== Tuix_Feedback_Config::secret();
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'Tuix feedback', 'tuix-feedback' ); ?></h1>
			<p><?php esc_html_e( 'Your team sees the tuix. button on your site: signed-in people who work in wp-admin, in the roles you choose. They click it, point at any element and leave a comment with a screenshot; you triage it in Tuix. Visitors, subscribers and customers never see it.', 'tuix-feedback' ); ?></p>
			<?php if ( is_array( $check ) ) : ?>
				<div id="tuix-check-result" class="notice <?php echo $check['ok'] ? 'notice-success' : 'notice-error'; ?> inline"><p><?php echo esc_html( $check['message'] ); ?></p></div>
			<?php endif; ?>
			<form method="post" action="options.php" id="tuix-settings">
				<?php settings_fields( self::PAGE ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="tuix-api-url"><?php esc_html_e( 'Tuix address', 'tuix-feedback' ); ?></label></th>
						<td>
							<input type="url" class="regular-text code" id="tuix-api-url" name="<?php echo esc_attr( Tuix_Feedback_Config::OPTION ); ?>[api_url]" value="<?php echo esc_attr( $settings['api_url'] ); ?>" <?php disabled( Tuix_Feedback_Config::pinned( 'api_url' ) ); ?> required>
							<p class="description"><?php echo Tuix_Feedback_Config::pinned( 'api_url' ) ? esc_html( $pinned ) : esc_html__( 'Where your Tuix runs, for example https://tuix.app.', 'tuix-feedback' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="tuix-project-key"><?php esc_html_e( 'Public project key', 'tuix-feedback' ); ?></label></th>
						<td>
							<input type="text" class="regular-text code" id="tuix-project-key" name="<?php echo esc_attr( Tuix_Feedback_Config::OPTION ); ?>[project_key]" value="<?php echo esc_attr( $settings['project_key'] ); ?>" placeholder="pk_live_…" autocomplete="off" spellcheck="false" <?php disabled( Tuix_Feedback_Config::pinned( 'project_key' ) ); ?>>
							<p class="description"><?php echo Tuix_Feedback_Config::pinned( 'project_key' ) ? esc_html( $pinned ) : esc_html__( 'Tuix → Project settings → Public project key.', 'tuix-feedback' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="tuix-secret"><?php esc_html_e( 'Signing key', 'tuix-feedback' ); ?></label></th>
						<td>
							<?php if ( Tuix_Feedback_Config::pinned( 'secret' ) ) : ?>
								<p><?php echo esc_html( $pinned ); ?></p>
							<?php else : ?>
								<input type="password" class="regular-text code" id="tuix-secret" name="<?php echo esc_attr( Tuix_Feedback_Config::SECRET_OPTION ); ?>" value="" placeholder="<?php echo $has_key ? esc_attr__( 'Saved. Leave empty to keep it.', 'tuix-feedback' ) : ''; ?>" autocomplete="new-password" spellcheck="false">
								<p class="description"><?php esc_html_e( 'Tuix → Project settings → Server-only signing key. It stays on this server and is never sent to browsers. For extra safety, define TUIX_SECRET_KEY in wp-config.php instead.', 'tuix-feedback' ); ?></p>
							<?php endif; ?>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="tuix-environment"><?php esc_html_e( 'Environment', 'tuix-feedback' ); ?></label></th>
						<td>
							<input type="text" class="regular-text code" id="tuix-environment" maxlength="40" list="tuix-environments" name="<?php echo esc_attr( Tuix_Feedback_Config::OPTION ); ?>[environment]" value="<?php echo esc_attr( $settings['environment'] ); ?>" <?php disabled( Tuix_Feedback_Config::pinned( 'environment' ) ); ?>>
							<datalist id="tuix-environments"><option value="production"><option value="uat"><option value="local"></datalist>
							<p class="description"><?php esc_html_e( 'production for the live site, uat for staging, local for a site on localhost.', 'tuix-feedback' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Who sees the widget', 'tuix-feedback' ); ?></th>
						<td>
							<fieldset id="tuix-roles">
								<?php foreach ( Tuix_Feedback_Config::eligible_roles() as $role => $label ) : ?>
									<label><input type="checkbox" name="<?php echo esc_attr( Tuix_Feedback_Config::OPTION ); ?>[roles][]" value="<?php echo esc_attr( $role ); ?>" <?php checked( in_array( $role, $settings['roles'], true ) ); ?>> <?php echo esc_html( translate_user_role( $label ) ); ?></label><br>
								<?php endforeach; ?>
								<p class="description"><?php esc_html_e( 'Only people who can work in wp-admin can comment. Visitors and front-end accounts such as subscribers or customers never see it.', 'tuix-feedback' ); ?></p>
							</fieldset>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Admin screens', 'tuix-feedback' ); ?></th>
						<td><label><input type="checkbox" id="tuix-admin" name="<?php echo esc_attr( Tuix_Feedback_Config::OPTION ); ?>[admin]" value="1" <?php checked( $settings['admin'] ); ?>> <?php esc_html_e( 'Also show it in wp-admin', 'tuix-feedback' ); ?></label></td>
					</tr>
				</table>
				<?php submit_button(); ?>
			</form>
			<h2><?php esc_html_e( 'Check the connection', 'tuix-feedback' ); ?></h2>
			<p><?php esc_html_e( 'Signs you in to Tuix from this server exactly as the widget would, using your WordPress account.', 'tuix-feedback' ); ?></p>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" id="tuix-check">
				<input type="hidden" name="action" value="tuix_feedback_check">
				<?php wp_nonce_field( 'tuix_feedback_check' ); ?>
				<?php submit_button( __( 'Check connection', 'tuix-feedback' ), 'secondary', 'submit', false ); ?>
			</form>
		</div>
		<?php
	}
}
