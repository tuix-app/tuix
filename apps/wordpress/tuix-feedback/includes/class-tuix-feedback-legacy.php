<?php
/**
 * The earlier "Tuix" plugin, from the folder tuix/, and the move to Tuix Feedback.
 *
 * @package Tuix
 */

defined( 'ABSPATH' ) || exit;

/**
 * Tuix Feedback was first distributed as "Tuix" (tuix/tuix.php), whose options are
 * tuix_settings, tuix_secret_key and tuix_runtime_last. Tuix Feedback keeps its own
 * (tuix_feedback_*), so uninstalling either plugin never touches the other's. While
 * the old plugin is active, this one leaves the widget to it and asks the administrator
 * to remove it. Once it runs on a site that has no settings of its own yet, it copies
 * the old plugin's, once.
 */
final class Tuix_Feedback_Legacy {
	/**
	 * The old plugin's options, each with Tuix Feedback's option and whether it is autoloaded.
	 *
	 * @var array<string,array{0:string,1:bool}>
	 */
	const OPTIONS = array(
		'tuix_settings'     => array( 'tuix_feedback_settings', true ),
		'tuix_secret_key'   => array( 'tuix_feedback_secret_key', false ),
		'tuix_runtime_last' => array( 'tuix_feedback_runtime_last', false ),
	);

	/** The notice while the old plugin runs; otherwise the one-time copy on this site. */
	public static function register() {
		if ( self::active() ) {
			add_action( 'admin_notices', array( __CLASS__, 'notice' ) );
			return;
		}
		self::copy();
	}

	/** Whether the old plugin runs in this request. It defines this constant. */
	public static function active() {
		return defined( 'TUIX_PLUGIN_VERSION' );
	}

	/** Tells administrators to remove the old plugin. */
	public static function notice() {
		if ( ! current_user_can( 'activate_plugins' ) ) {
			return;
		}
		printf(
			'<div class="notice notice-warning"><p>%s</p></div>',
			esc_html__( 'Tuix Feedback replaces the plugin Tuix, which is still active. Deactivate Tuix: Tuix Feedback then copies its settings and takes over. Then delete Tuix.', 'tuix-feedback' )
		);
	}

	/**
	 * Copies the old plugin's settings on the current site while Tuix Feedback has none.
	 * A secret stays out of autoload. Each site of a network copies its own, on its first
	 * request with Tuix Feedback active.
	 */
	public static function copy() {
		if ( null !== get_option( Tuix_Feedback_Config::OPTION, null ) ) {
			return;
		}
		foreach ( self::OPTIONS as $old => list( $option, $autoload ) ) {
			$value = get_option( $old, null );
			if ( null !== $value && null === get_option( $option, null ) ) {
				add_option( $option, $value, '', $autoload );
			}
		}
	}
}
