<?php
/**
 * Plugin Name:       Tuix Feedback
 * Plugin URI:        https://tuix.app
 * Description:       Element-anchored feedback for your WordPress site. Signed-in team members point at anything on a page and leave a comment; you triage it in Tuix.
 * Version:           0.2.0
 * Requires at least: 6.3
 * Requires PHP:      7.4
 * Author:            Tuix
 * License:           GPLv2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       tuix-feedback
 *
 * @package Tuix
 */

defined( 'ABSPATH' ) || exit;

define( 'TUIX_FEEDBACK_VERSION', '0.2.0' );
define( 'TUIX_FEEDBACK_FILE', __FILE__ );

require_once __DIR__ . '/includes/class-tuix-feedback-config.php';
require_once __DIR__ . '/includes/class-tuix-feedback-runtime.php';
require_once __DIR__ . '/includes/class-tuix-feedback-widget.php';
require_once __DIR__ . '/includes/class-tuix-feedback-admin.php';
require_once __DIR__ . '/includes/class-tuix-feedback-legacy.php';

add_action(
	'plugins_loaded',
	static function () {
		Tuix_Feedback_Legacy::register();
		// While the earlier "Tuix" plugin is active it keeps the site's widget; this one waits.
		if ( Tuix_Feedback_Legacy::active() ) {
			return;
		}
		Tuix_Feedback_Runtime::register();
		Tuix_Feedback_Widget::register();
		if ( is_admin() ) {
			Tuix_Feedback_Admin::register();
		}
	}
);
