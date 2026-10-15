<?php
/**
 * Removes Tuix Feedback's settings from every site. Reports stay in Tuix. The settings
 * of the earlier plugin Tuix (tuix_*) are its own and stay.
 *
 * @package Tuix
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

/** Deletes this site's Tuix Feedback options and cached runtime. */
function tuix_feedback_uninstall_site() {
	global $wpdb;
	delete_option( 'tuix_feedback_settings' );
	delete_option( 'tuix_feedback_secret_key' );
	delete_option( 'tuix_feedback_runtime_last' );
	$wpdb->query( "DELETE FROM {$wpdb->options} WHERE option_name LIKE '\\_transient\\_tuix\\_feedback\\_%' OR option_name LIKE '\\_transient\\_timeout\\_tuix\\_feedback\\_%'" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
	wp_clear_scheduled_hook( 'tuix_feedback_refresh_runtime' );
}

if ( is_multisite() ) {
	foreach ( get_sites( array( 'fields' => 'ids', 'number' => 0 ) ) as $tuix_site_id ) {
		switch_to_blog( $tuix_site_id );
		tuix_feedback_uninstall_site();
		restore_current_blog();
	}
} else {
	tuix_feedback_uninstall_site();
}
