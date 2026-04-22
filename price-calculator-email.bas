Attribute VB_Name = "PriceCalculatorEmail"
Option Explicit

Private Const CATI_SHEET As String = "CATI"
Private Const CAWI_SHEET As String = "CAWI"

Public Sub GenerateCATIEmail()
    GenerateEmailBlock CATI_SHEET
End Sub

Public Sub GenerateCAWIEmail()
    GenerateEmailBlock CAWI_SHEET
End Sub

Public Sub SendCATIEmail()
    SendEmailFromSheet CATI_SHEET
End Sub

Public Sub SendCAWIEmail()
    SendEmailFromSheet CAWI_SHEET
End Sub

Private Sub GenerateEmailBlock(ByVal sheetName As String)
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(sheetName)
    
    Dim cfg As Object
    Set cfg = GetSheetConfig(sheetName)
    
    Dim contactName As String
    Dim clientEmail As String
    Dim projectName As String
    Dim subjectLine As String
    Dim bodyText As String
    
    contactName = Trim$(CStr(ws.Range(cfg("contact_name")).Value))
    clientEmail = Trim$(CStr(ws.Range(cfg("client_email")).Value))
    projectName = Trim$(CStr(ws.Range(cfg("project_name")).Value))
    
    If projectName = vbNullString Then
        projectName = cfg("default_project_name")
    End If
    
    subjectLine = BuildSubject(ws, cfg, projectName)
    bodyText = BuildBody(ws, cfg, projectName, contactName)
    
    ws.Range(cfg("email_subject")).Value = subjectLine
    ws.Range(cfg("email_body")).Value = bodyText
    
    If clientEmail <> vbNullString Then
        ws.Range(cfg("email_status")).Value = "Draft ready for " & clientEmail
    Else
        ws.Range(cfg("email_status")).Value = "Draft ready. Add client email before sending."
    End If
End Sub

Private Sub SendEmailFromSheet(ByVal sheetName As String)
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets(sheetName)
    
    Dim cfg As Object
    Set cfg = GetSheetConfig(sheetName)
    
    If Trim$(CStr(ws.Range(cfg("email_subject")).Value)) = vbNullString _
       Or Trim$(CStr(ws.Range(cfg("email_body")).Value)) = vbNullString Then
        GenerateEmailBlock sheetName
    End If
    
    Dim recipient As String
    recipient = Trim$(CStr(ws.Range(cfg("client_email")).Value))
    
    If recipient = vbNullString Then
        MsgBox "Please enter the client e-mail address first.", vbExclamation, "Missing e-mail"
        Exit Sub
    End If
    
    Dim outlookApp As Object
    Dim outlookMail As Object
    
    On Error Resume Next
    Set outlookApp = GetObject(, "Outlook.Application")
    If outlookApp Is Nothing Then
        Set outlookApp = CreateObject("Outlook.Application")
    End If
    On Error GoTo 0
    
    If outlookApp Is Nothing Then
        MsgBox "Outlook could not be opened.", vbCritical, "E-mail unavailable"
        Exit Sub
    End If
    
    Set outlookMail = outlookApp.CreateItem(0)
    
    With outlookMail
        .To = recipient
        .Subject = CStr(ws.Range(cfg("email_subject")).Value)
        .Body = CStr(ws.Range(cfg("email_body")).Value)
        .Display
    End With
    
    ws.Range(cfg("email_status")).Value = "E-mail opened in Outlook at " & Format(Now, "yyyy-mm-dd hh:mm")
End Sub

Private Function BuildSubject(ByVal ws As Worksheet, ByVal cfg As Object, ByVal projectName As String) As String
    BuildSubject = "Proposal - " & projectName & " - " & cfg("label") & " - " & CStr(ws.Range(cfg("country")).Value)
End Function

Private Function BuildBody(ByVal ws As Worksheet, ByVal cfg As Object, ByVal projectName As String, ByVal contactName As String) As String
    Dim greetingName As String
    greetingName = contactName
    If greetingName = vbNullString Then greetingName = "there"
    
    Dim lines As Collection
    Set lines = New Collection
    
    lines.Add "Hi " & greetingName
    lines.Add ""
    lines.Add "Thank you for your request. Please find below our proposal for " & projectName & "."
    lines.Add ""
    lines.Add "Methodology: " & cfg("label")
    lines.Add "Country: " & CStr(ws.Range(cfg("country")).Value)
    lines.Add "LOI: " & FormatValue(ws.Range(cfg("loi")).Value, "0") & " min"
    lines.Add "Incidence rate: " & FormatValue(ws.Range(cfg("ir")).Value, "0%")
    lines.Add "Sample size: " & FormatValue(ws.Range(cfg("sample")).Value, "0")
    
    If cfg.Exists("method") Then
        lines.Add "Method: " & CStr(ws.Range(cfg("method")).Value)
    End If
    
    lines.Add "Price per complete: " & FormatValue(ws.Range(cfg("price_per_complete")).Value, "EUR #,##0.00")
    lines.Add "Total proposed price: " & FormatValue(ws.Range(cfg("total_price")).Value, "EUR #,##0.00")
    lines.Add ""
    lines.Add "Please let me know if you would like an updated version with changes to sample size, LOI, IR or add-ons."
    lines.Add ""
    lines.Add "Best regards,"
    
    BuildBody = JoinCollection(lines, vbCrLf)
End Function

Private Function GetSheetConfig(ByVal sheetName As String) As Object
    Dim cfg As Object
    Set cfg = CreateObject("Scripting.Dictionary")
    
    cfg("client_email") = "AB3"
    cfg("contact_name") = "AB4"
    cfg("project_name") = "AB5"
    cfg("email_subject") = "AB6"
    cfg("email_body") = "AB7"
    cfg("email_status") = "AB9"
    
    Select Case UCase$(sheetName)
        Case CATI_SHEET
            cfg("label") = "CATI"
            cfg("default_project_name") = "CATI project"
            cfg("country") = "D2"
            cfg("loi") = "D5"
            cfg("ir") = "D6"
            cfg("sample") = "D8"
            cfg("total_price") = "F29"
            cfg("price_per_complete") = "F31"
        Case CAWI_SHEET
            cfg("label") = "CAWI"
            cfg("default_project_name") = "CAWI project"
            cfg("country") = "D2"
            cfg("method") = "D5"
            cfg("loi") = "D6"
            cfg("ir") = "D7"
            cfg("sample") = "D8"
            cfg("total_price") = "F24"
            cfg("price_per_complete") = "F25"
        Case Else
            Err.Raise vbObjectError + 1000, "GetSheetConfig", "Unsupported sheet: " & sheetName
    End Select
    
    Set GetSheetConfig = cfg
End Function

Private Function JoinCollection(ByVal values As Collection, ByVal separator As String) As String
    Dim i As Long
    Dim result As String
    
    For i = 1 To values.Count
        If i > 1 Then result = result & separator
        result = result & CStr(values(i))
    Next i
    
    JoinCollection = result
End Function

Private Function FormatValue(ByVal inputValue As Variant, ByVal numberFormat As String) As String
    If IsNumeric(inputValue) Then
        FormatValue = Format$(CDbl(inputValue), numberFormat)
    Else
        FormatValue = CStr(inputValue)
    End If
End Function
