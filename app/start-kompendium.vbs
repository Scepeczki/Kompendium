' Uruchamia Kompendium i otwiera je w przeglądarce.
'
' Aplikacja jest najpierw BUDOWANA, a dopiero potem podawana. Zbudowana
' wersja chodzi kilka razy płynniej od trybu pracy (`npm run dev`), bo ten
' przy każdym rysowaniu sprawdza sam siebie — przy długich ścieżkach to
' różnica między pisaniem gładkim a szarpanym.
'
' Adres MUSI zostać ten sam (localhost:5173): dane siedzą w przeglądarce
' i są przywiązane do adresu. Inny port = pusta aplikacja.
'
' Gdyby budowanie się nie powiodło (np. w trakcie zmian w kodzie),
' uruchamiamy tryb pracy — lepiej wolniej niż wcale.

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = scriptDir

adres = "http://localhost:5173"

Function Odpowiada()
    Odpowiada = False
    Set http = CreateObject("MSXML2.XMLHTTP")
    On Error Resume Next
    http.Open "GET", adres, False
    http.Send
    If Err.Number = 0 And http.Status = 200 Then Odpowiada = True
    Err.Clear
    On Error Goto 0
End Function

' Jeśli serwer już chodzi, nie stawiamy drugiego — po prostu otwieramy okno.
If Not Odpowiada() Then
    ' budowanie: czekamy na wynik (zwykle ok. dwóch sekund)
    kod = shell.Run("cmd /c npm run build", 0, True)
    If kod = 0 Then
        shell.Run "cmd /c npm run preview -- --port 5173 --strictPort", 0, False
    Else
        shell.Run "cmd /c npm run dev", 0, False
    End If

    For i = 1 To 30
        WScript.Sleep 1000
        If Odpowiada() Then Exit For
    Next
End If

' Otwórz zawsze w Firefoksie, niezależnie od domyślnej przeglądarki systemu
firefoxPath = "C:\Program Files\Mozilla Firefox\firefox.exe"
If fso.FileExists(firefoxPath) Then
    shell.Run """" & firefoxPath & """ " & adres
Else
    shell.Run adres
End If
