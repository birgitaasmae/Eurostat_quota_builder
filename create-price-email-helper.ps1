$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression.FileSystem

$sourcePath = 'C:\Users\User\Documents\javascript-sprint\price-calculator-redesign-source.xlsx'
$outputPath = 'C:\Users\User\Documents\javascript-sprint\price-calculator-email-helper.xlsx'
$tempRoot = Join-Path $env:TEMP ('price-email-helper-' + [guid]::NewGuid().ToString('N'))

function Get-WorksheetDoc([string]$path) {
  $doc = New-Object System.Xml.XmlDocument
  $doc.PreserveWhitespace = $true
  $doc.Load($path)
  return $doc
}

function Get-OrCreate-Row($doc, [int]$rowIndex) {
  $sheetData = $doc.SelectSingleNode("/*[local-name()='worksheet']/*[local-name()='sheetData']")
  $row = $doc.SelectSingleNode("//*[local-name()='row'][@r='$rowIndex']")
  if ($row) { return $row }

  $row = $doc.CreateElement('row', $doc.DocumentElement.NamespaceURI)
  $attr = $doc.CreateAttribute('r')
  $attr.Value = [string]$rowIndex
  $row.Attributes.Append($attr) | Out-Null

  $inserted = $false
  foreach ($existing in @($sheetData.ChildNodes)) {
    if ($existing.Name -ne 'row') { continue }
    $existingIndex = [int]$existing.Attributes['r'].Value
    if ($existingIndex -gt $rowIndex) {
      $sheetData.InsertBefore($row, $existing) | Out-Null
      $inserted = $true
      break
    }
  }
  if (-not $inserted) {
    $sheetData.AppendChild($row) | Out-Null
  }
  return $row
}

function Get-OrCreate-Cell($doc, [string]$ref) {
  $cell = $doc.SelectSingleNode("//*[local-name()='c'][@r='$ref']")
  if ($cell) { return $cell }

  if ($ref -notmatch '^([A-Z]+)([0-9]+)$') {
    throw "Invalid cell ref: $ref"
  }
  $rowIndex = [int]$matches[2]
  $row = Get-OrCreate-Row $doc $rowIndex

  $cell = $doc.CreateElement('c', $doc.DocumentElement.NamespaceURI)
  $attr = $doc.CreateAttribute('r')
  $attr.Value = $ref
  $cell.Attributes.Append($attr) | Out-Null

  $row.AppendChild($cell) | Out-Null
  return $cell
}

function Clear-Cell($cell) {
  while ($cell.HasChildNodes) {
    $cell.RemoveChild($cell.FirstChild) | Out-Null
  }
  while ($cell.Attributes.Count -gt 1) {
    $cell.Attributes.RemoveAt(1)
  }
}

function Set-InlineStringCell($doc, [string]$ref, [string]$text) {
  $cell = Get-OrCreate-Cell $doc $ref
  Clear-Cell $cell

  $tAttr = $doc.CreateAttribute('t')
  $tAttr.Value = 'inlineStr'
  $cell.Attributes.Append($tAttr) | Out-Null

  $is = $doc.CreateElement('is', $doc.DocumentElement.NamespaceURI)
  $t = $doc.CreateElement('t', $doc.DocumentElement.NamespaceURI)
  $t.InnerText = $text
  $is.AppendChild($t) | Out-Null
  $cell.AppendChild($is) | Out-Null
}

function Set-StringFormulaCell($doc, [string]$ref, [string]$formula, [string]$value) {
  $cell = Get-OrCreate-Cell $doc $ref
  Clear-Cell $cell

  $tAttr = $doc.CreateAttribute('t')
  $tAttr.Value = 'str'
  $cell.Attributes.Append($tAttr) | Out-Null

  $f = $doc.CreateElement('f', $doc.DocumentElement.NamespaceURI)
  $f.InnerText = $formula
  $cell.AppendChild($f) | Out-Null

  $v = $doc.CreateElement('v', $doc.DocumentElement.NamespaceURI)
  $v.InnerText = $value
  $cell.AppendChild($v) | Out-Null
}

function Set-StringCell($doc, [string]$ref, [string]$value) {
  $cell = Get-OrCreate-Cell $doc $ref
  Clear-Cell $cell

  $tAttr = $doc.CreateAttribute('t')
  $tAttr.Value = 'str'
  $cell.Attributes.Append($tAttr) | Out-Null

  $v = $doc.CreateElement('v', $doc.DocumentElement.NamespaceURI)
  $v.InnerText = $value
  $cell.AppendChild($v) | Out-Null
}

function Set-Dimension($doc, [string]$ref) {
  $dimension = $doc.SelectSingleNode("/*[local-name()='worksheet']/*[local-name()='dimension']")
  if (-not $dimension) {
    $dimension = $doc.CreateElement('dimension', $doc.DocumentElement.NamespaceURI)
    $doc.DocumentElement.PrependChild($dimension) | Out-Null
  }
  if ($dimension.Attributes['ref']) {
    $dimension.Attributes['ref'].Value = $ref
  } else {
    $attr = $doc.CreateAttribute('ref')
    $attr.Value = $ref
    $dimension.Attributes.Append($attr) | Out-Null
  }
}

function Add-CatiEmailBlock($doc) {
  Set-InlineStringCell $doc 'AA2' 'EMAIL RESPONSE'
  Set-InlineStringCell $doc 'AA3' 'Client email'
  Set-StringCell $doc 'AB3' ''
  Set-InlineStringCell $doc 'AA4' 'Contact name'
  Set-StringCell $doc 'AB4' 'there'
  Set-InlineStringCell $doc 'AA5' 'Project name'
  Set-StringCell $doc 'AB5' 'CATI project'
  Set-InlineStringCell $doc 'AA6' 'Email subject'
  Set-StringFormulaCell $doc 'AB6' '"Proposal - "&AB5&" - CATI - "&D2' 'Proposal - CATI project - CATI - ESTONIA'
  Set-InlineStringCell $doc 'AA7' 'Email draft'
  $body = '"Hi "&IF(AB4<>"",AB4,"there")&CHAR(10)&CHAR(10)&"Thank you for your request. Please find below our CATI proposal for "&AB5&"."&CHAR(10)&CHAR(10)&"Country: "&D2&CHAR(10)&"LOI: "&TEXT(D5,"0")&" min"&CHAR(10)&"Incidence rate: "&TEXT(D6,"0%")&CHAR(10)&"Sample size: "&TEXT(D8,"0")&CHAR(10)&"Price per complete: "&TEXT(F31,"EUR #,##0.00")&CHAR(10)&"Total proposed price: "&TEXT(F29,"EUR #,##0.00")&CHAR(10)&CHAR(10)&"Please let me know if you would like an updated version with changes to sample size, LOI, IR or add-ons."&CHAR(10)&CHAR(10)&"Best regards,"'
  Set-StringFormulaCell $doc 'AB7' $body "Hi there`n`nThank you for your request."
  Set-InlineStringCell $doc 'AA8' 'Send via e-mail'
  $mailto = 'HYPERLINK("mailto:"&AB3&"?subject="&SUBSTITUTE(AB6," ","%20")&"&body="&SUBSTITUTE(SUBSTITUTE(AB7,CHAR(10),"%0D%0A")," ","%20"),"Send CATI e-mail")'
  Set-StringFormulaCell $doc 'AB8' $mailto 'Send CATI e-mail'
  Set-Dimension $doc 'A1:AB38'
}

function Add-CawiEmailBlock($doc) {
  Set-InlineStringCell $doc 'AA2' 'EMAIL RESPONSE'
  Set-InlineStringCell $doc 'AA3' 'Client email'
  Set-StringCell $doc 'AB3' ''
  Set-InlineStringCell $doc 'AA4' 'Contact name'
  Set-StringCell $doc 'AB4' 'there'
  Set-InlineStringCell $doc 'AA5' 'Project name'
  Set-StringCell $doc 'AB5' 'CAWI project'
  Set-InlineStringCell $doc 'AA6' 'Email subject'
  Set-StringFormulaCell $doc 'AB6' '"Proposal - "&AB5&" - CAWI - "&D2' 'Proposal - CAWI project - CAWI - ESTONIA'
  Set-InlineStringCell $doc 'AA7' 'Email draft'
  $body = '"Hi "&IF(AB4<>"",AB4,"there")&CHAR(10)&CHAR(10)&"Thank you for your request. Please find below our CAWI proposal for "&AB5&"."&CHAR(10)&CHAR(10)&"Country: "&D2&CHAR(10)&"Method: "&D5&CHAR(10)&"LOI: "&TEXT(D6,"0")&" min"&CHAR(10)&"Incidence rate: "&TEXT(D7,"0%")&CHAR(10)&"Sample size: "&TEXT(D8,"0")&CHAR(10)&"Price per complete: "&TEXT(F25,"EUR #,##0.00")&CHAR(10)&"Total proposed price: "&TEXT(F24,"EUR #,##0.00")&CHAR(10)&CHAR(10)&"Please let me know if you would like an updated version with changes to sample size, LOI, IR or add-ons."&CHAR(10)&CHAR(10)&"Best regards,"'
  Set-StringFormulaCell $doc 'AB7' $body "Hi there`n`nThank you for your request."
  Set-InlineStringCell $doc 'AA8' 'Send via e-mail'
  $mailto = 'HYPERLINK("mailto:"&AB3&"?subject="&SUBSTITUTE(AB6," ","%20")&"&body="&SUBSTITUTE(SUBSTITUTE(AB7,CHAR(10),"%0D%0A")," ","%20"),"Send CAWI e-mail")'
  Set-StringFormulaCell $doc 'AB8' $mailto 'Send CAWI e-mail'
  Set-Dimension $doc 'A1:AB27'
}

if (Test-Path $tempRoot) {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $tempRoot | Out-Null

[System.IO.Compression.ZipFile]::ExtractToDirectory($sourcePath, $tempRoot)

$sheet1Path = Join-Path $tempRoot 'xl\worksheets\sheet1.xml'
$sheet2Path = Join-Path $tempRoot 'xl\worksheets\sheet2.xml'

$sheet1 = Get-WorksheetDoc $sheet1Path
$sheet2 = Get-WorksheetDoc $sheet2Path

Add-CatiEmailBlock $sheet1
Add-CawiEmailBlock $sheet2

$sheet1.Save($sheet1Path)
$sheet2.Save($sheet2Path)

if (Test-Path $outputPath) {
  Remove-Item -LiteralPath $outputPath -Force
}

$zipOut = [System.IO.Compression.ZipFile]::Open($outputPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  Get-ChildItem -LiteralPath $tempRoot -Recurse -File | ForEach-Object {
    $relative = $_.FullName.Substring($tempRoot.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zipOut, $_.FullName, $relative) | Out-Null
  }
} finally {
  $zipOut.Dispose()
}

[pscustomobject]@{
  Output = $outputPath
  Source = $sourcePath
} | ConvertTo-Json
