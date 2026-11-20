// Kompendium jako program na Windows.
//
// Sama aplikacja to ten sam kod co strona (folder `src`). Tutaj jest tylko to,
// czego przeglądarka nie potrafi:
// - ikonka przy zegarku: zamknięcie okna chowa program, a nie go wyłącza,
//   dzięki czemu przypomnienia przychodzą dalej;
// - start z Windows (w tle, bez okna);
// - jedna kopia programu: drugie uruchomienie pokazuje już otwarte okno;
// - zapisywanie plików (kopie zapasowe) w zwykłym folderze na dysku;
// - aktualizacje z GitHuba.

use percent_encoding::percent_decode_str;
use std::path::PathBuf;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WindowEvent,
};

/// Argument, z którym Windows uruchamia program przy starcie systemu.
const W_TLE: &str = "--w-tle";

fn pokaz_okno(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn naglowek(req: &tauri::ipc::Request, nazwa: &str) -> Result<String, String> {
    let surowy = req
        .headers()
        .get(nazwa)
        .ok_or(format!("brak nagłówka {nazwa}"))?
        .to_str()
        .map_err(|e| e.to_string())?;
    Ok(percent_decode_str(surowy).decode_utf8_lossy().into_owned())
}

/// Zapisuje plik (treść w ciele żądania) pod pełną ścieżką z nagłówka
/// `sciezka`. Brakujące foldery zakłada. Istniejącego pliku nie nadpisuje,
/// chyba że nagłówek `nadpisz` = 1 (wtedy użytkownik sam wskazał plik).
#[tauri::command]
fn zapisz_plik(request: tauri::ipc::Request) -> Result<String, String> {
    let sciezka = PathBuf::from(naglowek(&request, "sciezka")?);
    let nadpisz = naglowek(&request, "nadpisz").map(|v| v == "1").unwrap_or(false);
    let tauri::ipc::InvokeBody::Raw(dane) = request.body() else {
        return Err("treść pliku nie przyszła jako bajty".into());
    };
    if sciezka.exists() && !nadpisz {
        return Err(format!("plik już istnieje: {}", sciezka.display()));
    }
    if let Some(folder) = sciezka.parent() {
        std::fs::create_dir_all(folder).map_err(|e| e.to_string())?;
    }
    std::fs::write(&sciezka, dane).map_err(|e| e.to_string())?;
    Ok(sciezka.display().to_string())
}

#[derive(serde::Serialize)]
struct Kopia {
    nazwa: String,
    rozmiar: u64,
}

/// Kopie zapasowe w folderze (tylko pliki kompendium-*.zip), od najstarszej.
#[tauri::command]
fn lista_kopii(folder: String) -> Result<Vec<Kopia>, String> {
    let mut out = Vec::new();
    let Ok(wpisy) = std::fs::read_dir(&folder) else {
        return Ok(out);
    };
    for w in wpisy.flatten() {
        let nazwa = w.file_name().to_string_lossy().into_owned();
        if nazwa.starts_with("kompendium-") && nazwa.ends_with(".zip") {
            let rozmiar = w.metadata().map(|m| m.len()).unwrap_or(0);
            out.push(Kopia { nazwa, rozmiar });
        }
    }
    out.sort_by(|a, b| a.nazwa.cmp(&b.nazwa));
    Ok(out)
}

/// Usuwa jedną starą kopię — tylko plik kompendium-*.zip z tego folderu.
/// Program woła to wyłącznie, gdy użytkownik sam ustawił limit kopii.
#[tauri::command]
fn usun_kopie(folder: String, nazwa: String) -> Result<(), String> {
    if !(nazwa.starts_with("kompendium-") && nazwa.ends_with(".zip"))
        || nazwa.contains(['/', '\\'])
    {
        return Err("to nie jest plik kopii".into());
    }
    std::fs::remove_file(PathBuf::from(folder).join(nazwa)).map_err(|e| e.to_string())
}

/// Domyślny folder kopii: Dokumenty\Kompendium\Kopie.
#[tauri::command]
fn domyslny_folder_kopii(app: AppHandle) -> Result<String, String> {
    let dok = app.path().document_dir().map_err(|e| e.to_string())?;
    Ok(dok.join("Kompendium").join("Kopie").display().to_string())
}

/// Otwiera folder w Eksploratorze (zakłada go, jeśli go nie ma).
#[tauri::command]
fn otworz_folder(folder: String) -> Result<(), String> {
    std::fs::create_dir_all(&folder).map_err(|e| e.to_string())?;
    std::process::Command::new("explorer")
        .arg(&folder)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        // musi być pierwsza: drugie uruchomienie tylko pokazuje okno.
        // Wyjątek: egzemplarz próbny (scripts/sprawdz-program.mjs) chodzi
        // obok zainstalowanego programu, na własnych danych.
        if std::env::var_os("KOMPENDIUM_PROBA").is_none() {
            builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                pokaz_okno(app);
            }));
        }
        builder = builder
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                Some(vec![W_TLE]),
            ))
            .plugin(tauri_plugin_updater::Builder::new().build());
    }

    builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            zapisz_plik,
            lista_kopii,
            usun_kopie,
            domyslny_folder_kopii,
            otworz_folder
        ])
        .setup(|app| {
            let otworz = MenuItem::with_id(app, "otworz", "Otwórz Kompendium", true, None::<&str>)?;
            let zakoncz = MenuItem::with_id(app, "zakoncz", "Zakończ", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&otworz, &zakoncz])?;
            TrayIconBuilder::with_id("kompendium")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Kompendium")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "otworz" => pokaz_okno(app),
                    "zakoncz" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = e
                    {
                        pokaz_okno(tray.app_handle());
                    }
                })
                .build(app)?;

            // Start z Windows: program wstaje w tle, okno dopiero na żądanie.
            if !std::env::args().any(|a| a == W_TLE) {
                pokaz_okno(app.handle());
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Krzyżyk chowa okno do ikonki przy zegarku — przypomnienia
            // przychodzą dalej. Całkiem wyłącza „Zakończ" w menu ikonki.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("Kompendium nie wstało");
}
