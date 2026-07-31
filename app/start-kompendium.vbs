' Uruchamia serwer deweloperski Kompendium w tle i otwiera aplikację w przeglądarce.
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = scriptDir

' Odpal serwer w tle (bez widocznego okna konsoli)
shell.Run "cmd /c npm run dev", 0, False

' Poczekaj, aż serwer zacznie odpowiadać, potem otwórz przeglądarkę
Set http = CreateObject("MSXML2.XMLHTTP")
ready = False
For i = 1 To 30
    WScript.Sleep 1000
    On Error Resume Next
    http.Open "GET", "http://localhost:5173", False
    http.Send
    If Err.Number = 0 And http.Status = 200 Then
        ready = True
        Err.Clear
        Exit For
    End If
    Err.Clear
    On Error Goto 0
Next

' Otwórz zawsze w Firefoksie, niezależnie od domyślnej przeglądarki systemu
firefoxPath = "C:\Program Files\Mozilla Firefox\firefox.exe"
If fso.FileExists(firefoxPath) Then
    shell.Run """" & firefoxPath & """ http://localhost:5173"
Else
    shell.Run "http://localhost:5173"
End If
