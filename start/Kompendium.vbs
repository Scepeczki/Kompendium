' Uruchamia Kompendium: wlacza serwer aplikacji (jesli nie dziala) i otwiera Firefoksa.
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
appDir = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName)) & "\app"

Function Dziala()
  On Error Resume Next
  Set http = CreateObject("MSXML2.ServerXMLHTTP")
  http.setTimeouts 500, 500, 500, 500
  http.Open "GET", "http://localhost:5173/", False
  http.Send
  Dziala = (Err.Number = 0 And http.Status = 200)
End Function

If Not Dziala() Then
  sh.CurrentDirectory = appDir
  If Not fso.FolderExists(appDir & "\dist") Then sh.Run "cmd /c npm run build", 0, True
  sh.Run "cmd /c npm run preview -- --port 5173 --strictPort", 0, False
  For i = 1 To 40
    WScript.Sleep 500
    If Dziala() Then Exit For
  Next
End If
sh.Run "http://localhost:5173/"
