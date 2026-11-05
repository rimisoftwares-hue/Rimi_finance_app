#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                // Windows-specific native caption customization
                #[cfg(target_os = "windows")]
                {
                    let _ = window.set_theme(Some(tauri::Theme::Dark));
                    let _ = window.set_title("");
                    let _ = window.set_decorations(true);
                }

                // macOS-specific native traffic-light overlay customization
                #[cfg(target_os = "macos")]
                {
                    let _ = window.set_title_bar_style(tauri::TitleBarStyle::Overlay);
                    let _ = window.set_decorations(true);
                }

                // Linux-specific window manager decoration customization
                #[cfg(target_os = "linux")]
                {
                    use gtk::prelude::*;

                    let _ = window.set_title("");
                    let _ = window.set_decorations(false);

                    if let (Ok(gtk_win), Ok(vbox)) = (window.gtk_window(), window.default_vbox()) {
                        gtk_win.set_decorated(false);

                        // 1. Create GtkOverlay
                        let overlay = gtk::Overlay::new();

                        // 2. Move webview from vbox into overlay so webview's grandparent remains gtk_win
                        for child in vbox.children() {
                            vbox.remove(&child);
                            overlay.add(&child);
                        }
                        gtk_win.remove(&vbox);

                        // 3. Create native GtkHeaderBar with genuine OS caption buttons
                        let header = gtk::HeaderBar::new();
                        header.set_show_close_button(true);
                        header.set_decoration_layout(Some(":minimize,maximize,close"));
                        header.set_title(Some(""));
                        header.style_context().add_class("transparent-header");
                        header.set_valign(gtk::Align::Start);
                        header.set_halign(gtk::Align::End); // Float strictly at top-right
                        header.set_size_request(140, 32);

                        // 4. Add headerbar as overlay child
                        overlay.add_overlay(&header);

                        // 5. Add overlay to gtk_win and display
                        gtk_win.add(&overlay);
                        overlay.show_all();

                        // 6. GTK CSS provider styling default, hover, and active states
                        let provider = gtk::CssProvider::new();
                        let css = b"
                            .transparent-header,
                            headerbar.transparent-header,
                            headerbar.transparent-header windowhandle,
                            headerbar.transparent-header box {
                                background: transparent;
                                background-color: transparent;
                                background-image: none;
                                border: none;
                                box-shadow: none;
                            }

                            headerbar.transparent-header separator {
                                opacity: 0;
                                min-width: 0;
                                margin: 0;
                                padding: 0;
                                border: none;
                                background: transparent;
                            }

                            headerbar.transparent-header .title,
                            headerbar.transparent-header label.title {
                                opacity: 0;
                                font-size: 0;
                            }

                            /* Default state for title buttons */
                            headerbar.transparent-header button.titlebutton {
                                background: transparent;
                                background-color: transparent;
                                background-image: none;
                                border: none;
                                box-shadow: none;
                                color: #111827;
                                border-radius: 6px;
                                padding: 4px 8px;
                                margin: 2px;
                                min-width: 28px;
                                min-height: 28px;
                                transition: background-color 150ms ease-in-out, color 150ms ease-in-out;
                            }

                            headerbar.transparent-header button.titlebutton image {
                                color: #111827;
                                -gtk-icon-shadow: none;
                            }

                            /* Minimize & Maximize hover states */
                            headerbar.transparent-header button.titlebutton.minimize:hover,
                            headerbar.transparent-header button.titlebutton.maximize:hover {
                                background: #E5E7EB;
                                background-color: #E5E7EB;
                                background-image: none;
                                color: #111827;
                                box-shadow: none;
                            }

                            headerbar.transparent-header button.titlebutton.minimize:hover image,
                            headerbar.transparent-header button.titlebutton.maximize:hover image {
                                color: #111827;
                            }

                            /* Minimize & Maximize active/pressed states */
                            headerbar.transparent-header button.titlebutton.minimize:active,
                            headerbar.transparent-header button.titlebutton.maximize:active {
                                background: #D1D5DB;
                                background-color: #D1D5DB;
                                background-image: none;
                                color: #111827;
                                box-shadow: none;
                            }

                            /* Close button hover state */
                            headerbar.transparent-header button.titlebutton.close:hover {
                                background: #FEE2E2;
                                background-color: #FEE2E2;
                                background-image: none;
                                color: #DC2626;
                                box-shadow: none;
                            }

                            headerbar.transparent-header button.titlebutton.close:hover image {
                                color: #DC2626;
                            }

                            /* Close button active/pressed state */
                            headerbar.transparent-header button.titlebutton.close:active {
                                background: #FECACA;
                                background-color: #FECACA;
                                background-image: none;
                                color: #DC2626;
                                box-shadow: none;
                            }

                            headerbar.transparent-header button.titlebutton.close:active image {
                                color: #DC2626;
                            }
                        ";
                        let _ = provider.load_from_data(css);
                        if let Some(screen) = gtk::gdk::Screen::default() {
                            gtk::StyleContext::add_provider_for_screen(
                                &screen,
                                &provider,
                                gtk::STYLE_PROVIDER_PRIORITY_USER,
                            );
                        }
                    }
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app_lib::commands::print_document,
            app_lib::commands::create_print_window,
            app_lib::commands::open_os_privacy_settings,
            app_lib::commands::reset_webview_permissions,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri app");
}
