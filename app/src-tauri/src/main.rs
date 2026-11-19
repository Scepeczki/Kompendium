// Bez okna konsoli obok programu w wersji wydanej.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    kompendium_lib::run()
}
