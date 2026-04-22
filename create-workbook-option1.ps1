$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression.FileSystem

$sourcePath = 'C:\Users\User\Documents\javascript-sprint\price-calculator-redesign-source.xlsx'
$outputPath = 'C:\Users\User\Documents\javascript-sprint\price-calculator-option1-visible.xlsx'
$tempRoot = Join-Path $env:TEMP ('price-option1-' + [guid]::NewGuid().ToString('N'))

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
  $rAttr = $doc.CreateAttribute('r')
  $rAttr.Value = [string]$rowIndex
  $row.Attributes.Append($rAttr) | Out-Null

  $inserted = $false
  foreach ($existing in @($sheetData.ChildNodes)) {
    if ($existing.Name -ne 'row') { continue }
    if ([int]$existing.Attributes['r'].Value -gt $rowIndex) {
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
  $row = Get-OrCreate-Row $doc ([int]$matches[2])
  $cell = $doc.CreateElement('c', $doc.DocumentElement.NamespaceURI)
  $rAttr = $doc.CreateAttribute('r')
  $rAttr.Value = $ref
  $cell.Attributes.Append($rAttr) | Out-Null
  $row.AppendChild($cell) | Out-Null
  return $cell
}

function Reset-Cell($cell) {
  while ($cell.HasChildNodes) {
    $cell.RemoveChild($cell.FirstChild) | Out-Null
  }
  while ($cell.Attributes.Count -gt 1) {
    $cell.Attributes.RemoveAt(1)
  }
}

function Set-Style($cell, [int]$styleId) {
  $attr = $cell.OwnerDocument.CreateAttribute('s')
  $attr.Value = [string]$styleId
  $cell.Attributes.Append($attr) | Out-Null
}

function Set-InlineStringCell($doc, [string]$ref, [string]$text, [int]$styleId = -1) {
  $cell = Get-OrCreate-Cell $doc $ref
  Reset-Cell $cell
  if ($styleId -ge 0) { Set-Style $cell $styleId }
  $tAttr = $doc.CreateAttribute('t')
  $tAttr.Value = 'inlineStr'
  $cell.Attributes.Append($tAttr) | Out-Null
  $is = $doc.CreateElement('is', $doc.DocumentElement.NamespaceURI)
  $t = $doc.CreateElement('t', $doc.DocumentElement.NamespaceURI)
  $t.InnerText = $text
  $is.AppendChild($t) | Out-Null
  $cell.AppendChild($is) | Out-Null
}

function Set-StringCell($doc, [string]$ref, [string]$value, [int]$styleId = -1) {
  $cell = Get-OrCreate-Cell $doc $ref
  Reset-Cell $cell
  if ($styleId -ge 0) { Set-Style $cell $styleId }
  $tAttr = $doc.CreateAttribute('t')
  $tAttr.Value = 'str'
  $cell.Attributes.Append($tAttr) | Out-Null
  $v = $doc.CreateElement('v', $doc.DocumentElement.NamespaceURI)
  $v.InnerText = $value
  $cell.AppendChild($v) | Out-Null
}

function Set-NumberCell($doc, [string]$ref, [string]$value, [int]$styleId = -1) {
  $cell = Get-OrCreate-Cell $doc $ref
  Reset-Cell $cell
  if ($styleId -ge 0) { Set-Style $cell $styleId }
  $v = $doc.CreateElement('v', $doc.DocumentElement.NamespaceURI)
  $v.InnerText = $value
  $cell.AppendChild($v) | Out-Null
}

function Set-FormulaCell($doc, [string]$ref, [string]$formula, [string]$value, [string]$type = '', [int]$styleId = -1) {
  $cell = Get-OrCreate-Cell $doc $ref
  Reset-Cell $cell
  if ($styleId -ge 0) { Set-Style $cell $styleId }
  if ($type) {
    $tAttr = $doc.CreateAttribute('t')
    $tAttr.Value = $type
    $cell.Attributes.Append($tAttr) | Out-Null
  }
  $f = $doc.CreateElement('f', $doc.DocumentElement.NamespaceURI)
  $f.InnerText = $formula
  $cell.AppendChild($f) | Out-Null
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

function Set-VisibleArea($doc, [string]$activeCell, [string]$topLeftCell) {
  $sheetView = $doc.SelectSingleNode("/*[local-name()='worksheet']/*[local-name()='sheetViews']/*[local-name()='sheetView']")
  if (-not $sheetView) { return }

  if ($sheetView.Attributes['topLeftCell']) {
    $sheetView.Attributes['topLeftCell'].Value = $topLeftCell
  } else {
    $attr = $doc.CreateAttribute('topLeftCell')
    $attr.Value = $topLeftCell
    $sheetView.Attributes.Append($attr) | Out-Null
  }

  $selection = $sheetView.SelectSingleNode("*[local-name()='selection']")
  if (-not $selection) {
    $selection = $doc.CreateElement('selection', $doc.DocumentElement.NamespaceURI)
    $sheetView.AppendChild($selection) | Out-Null
  }

  foreach ($pair in @(
    @{ Name = 'activeCell'; Value = $activeCell },
    @{ Name = 'sqref'; Value = $activeCell },
    @{ Name = 'topLeftCell'; Value = $topLeftCell }
  )) {
    if ($selection.Attributes[$pair.Name]) {
      $selection.Attributes[$pair.Name].Value = $pair.Value
    } else {
      $attr = $doc.CreateAttribute($pair.Name)
      $attr.Value = $pair.Value
      $selection.Attributes.Append($attr) | Out-Null
    }
  }
}

function Add-CatiBlock($doc) {
  Set-InlineStringCell $doc 'AA1' 'NORSTAT PROPOSAL HELPER' 286
  Set-InlineStringCell $doc 'AA2' 'Client name' 44
  Set-StringCell $doc 'AB2' 'Client'
  Set-InlineStringCell $doc 'AA3' 'Contact name' 44
  Set-StringCell $doc 'AB3' 'there'
  Set-InlineStringCell $doc 'AA4' 'Project name' 44
  Set-StringCell $doc 'AB4' 'CATI project'
  Set-InlineStringCell $doc 'AA5' 'Total price' 44
  Set-FormulaCell $doc 'AB5' 'F29' '1980.7691088640834' '' 66
  Set-InlineStringCell $doc 'AA6' 'Price per complete' 44
  Set-FormulaCell $doc 'AB6' 'F31' '13.205127392427222' '' 39
  Set-InlineStringCell $doc 'AA7' 'Proposal summary' 44
  Set-FormulaCell $doc 'AB7' 'AB4&": CATI in "&D2&", n="&TEXT(D8,"0")&", LOI "&TEXT(D5,"0")&" min, IR "&TEXT(D6,"0%")&", total "&TEXT(F29,"EUR #,##0.00")' 'CATI summary' 'str'
  Set-InlineStringCell $doc 'AA8' 'Email subject' 44
  Set-FormulaCell $doc 'AB8' '"Proposal - "&AB4&" - CATI - "&D2' 'Proposal - CATI project - CATI - ESTONIA' 'str'
  Set-InlineStringCell $doc 'AA9' 'Copy-ready email text' 44
  $formula = '"Hi "&IF(AB3<>"",AB3,"there")&CHAR(10)&CHAR(10)&"Thank you for your request. Please find below our CATI proposal for "&AB4&"."&CHAR(10)&CHAR(10)&"Country: "&D2&CHAR(10)&"Sample size: "&TEXT(D8,"0")&CHAR(10)&"LOI: "&TEXT(D5,"0")&" min"&CHAR(10)&"IR: "&TEXT(D6,"0%")&CHAR(10)&"Price per complete: "&TEXT(F31,"EUR #,##0.00")&CHAR(10)&"Total proposed price: "&TEXT(F29,"EUR #,##0.00")&CHAR(10)&CHAR(10)&"Please let me know if you would like an updated version with changes to sample size, LOI, IR or scope."'
  Set-FormulaCell $doc 'AB9' $formula 'Hi there' 'str' 58
  Set-InlineStringCell $doc 'AA11' 'Copy cells AB8:AB9 into e-mail' 22
  Set-Dimension $doc 'A1:AB38'
  Set-VisibleArea $doc 'AA1' 'Y1'
}

function Add-CawiBlock($doc) {
  Set-InlineStringCell $doc 'W1' 'NORSTAT PROPOSAL HELPER' 286
  Set-InlineStringCell $doc 'W2' 'Client name' 44
  Set-StringCell $doc 'X2' 'Client'
  Set-InlineStringCell $doc 'W3' 'Contact name' 44
  Set-StringCell $doc 'X3' 'there'
  Set-InlineStringCell $doc 'W4' 'Project name' 44
  Set-StringCell $doc 'X4' 'CAWI project'
  Set-InlineStringCell $doc 'W5' 'Total price' 44
  Set-FormulaCell $doc 'X5' 'F24' '3778.4032348597575' '' 66
  Set-InlineStringCell $doc 'W6' 'Price per complete' 44
  Set-FormulaCell $doc 'X6' 'F25' '3.7784032348597574' '' 39
  Set-InlineStringCell $doc 'W7' 'Proposal summary' 44
  Set-FormulaCell $doc 'X7' 'X4&": CAWI in "&D2&", n="&TEXT(D8,"0")&", LOI "&TEXT(D6,"0")&" min, IR "&TEXT(D7,"0%")&", total "&TEXT(F24,"EUR #,##0.00")' 'CAWI summary' 'str'
  Set-InlineStringCell $doc 'W8' 'Email subject' 44
  Set-FormulaCell $doc 'X8' '"Proposal - "&X4&" - CAWI - "&D2' 'Proposal - CAWI project - CAWI - ESTONIA' 'str'
  Set-InlineStringCell $doc 'W9' 'Copy-ready email text' 44
  $formula = '"Hi "&IF(X3<>"",X3,"there")&CHAR(10)&CHAR(10)&"Thank you for your request. Please find below our CAWI proposal for "&X4&"."&CHAR(10)&CHAR(10)&"Country: "&D2&CHAR(10)&"Method: "&D5&CHAR(10)&"Sample size: "&TEXT(D8,"0")&CHAR(10)&"LOI: "&TEXT(D6,"0")&" min"&CHAR(10)&"IR: "&TEXT(D7,"0%")&CHAR(10)&"Price per complete: "&TEXT(F25,"EUR #,##0.00")&CHAR(10)&"Total proposed price: "&TEXT(F24,"EUR #,##0.00")&CHAR(10)&CHAR(10)&"Please let me know if you would like an updated version with changes to sample size, LOI, IR or scope."'
  Set-FormulaCell $doc 'X9' $formula 'Hi there' 'str' 58
  Set-InlineStringCell $doc 'W11' 'Copy cells X8:X9 into e-mail' 22
  Set-Dimension $doc 'A1:X27'
  Set-VisibleArea $doc 'W1' 'U1'
}

function Add-QualBlock($doc) {
  Set-InlineStringCell $doc 'P2' 'NORSTAT QUALITATIVE HELPER' 169
  Set-InlineStringCell $doc 'P3' 'Target group' 171
  Set-StringCell $doc 'Q3' 'B2C, easy target group'
  Set-InlineStringCell $doc 'P4' 'Participants' 171
  Set-NumberCell $doc 'Q4' '8'
  Set-InlineStringCell $doc 'P5' 'Sessions / interviews' 171
  Set-NumberCell $doc 'Q5' '1'
  Set-InlineStringCell $doc 'P6' 'Incentive per person' 171
  Set-NumberCell $doc 'Q6' '30'
  Set-InlineStringCell $doc 'P7' 'Reporting add-on' 171
  Set-NumberCell $doc 'Q7' '180'
  Set-InlineStringCell $doc 'P8' 'Recruitment price / person' 169
  $lookup = 'IF(Q3="B2C, easy target group",D4,IF(Q3="B2C, harder target group",D5,IF(Q3="B2C, very hard target group",D6,IF(Q3="B2B",D7,0))))'
  Set-FormulaCell $doc 'Q8' $lookup '100.17' '' 175
  Set-InlineStringCell $doc 'P9' 'Recruitment total' 169
  Set-FormulaCell $doc 'Q9' 'Q8*Q4' '801.36' '' 175
  Set-InlineStringCell $doc 'P10' 'Incentives total' 169
  Set-FormulaCell $doc 'Q10' 'Q6*Q4' '240' '' 175
  Set-InlineStringCell $doc 'P11' 'Session estimate' 169
  Set-FormulaCell $doc 'Q11' 'IF(Q5=0,0,Q5*180)' '180' '' 175
  Set-InlineStringCell $doc 'P12' 'Total estimate' 173
  Set-FormulaCell $doc 'Q12' 'SUM(Q9:Q11)+Q7' '1401.36' '' 175
  Set-InlineStringCell $doc 'P14' 'Client name' 169
  Set-StringCell $doc 'Q14' 'Client'
  Set-InlineStringCell $doc 'P15' 'Project name' 169
  Set-StringCell $doc 'Q15' 'Qualitative project'
  Set-InlineStringCell $doc 'P16' 'Proposal summary' 169
  Set-FormulaCell $doc 'Q16' 'Q15&": "&Q5&" session(s), "&Q4&" participants, target group "&Q3&", total "&TEXT(Q12,"EUR #,##0.00")' 'Qual summary' 'str'
  Set-InlineStringCell $doc 'P17' 'Copy-ready e-mail text' 169
  $formula = '"Thank you for your request. Please find below our qualitative estimate for "&Q15&"."&CHAR(10)&CHAR(10)&"Target group: "&Q3&CHAR(10)&"Participants: "&TEXT(Q4,"0")&CHAR(10)&"Sessions: "&TEXT(Q5,"0")&CHAR(10)&"Estimated total price: "&TEXT(Q12,"EUR #,##0.00")'
  Set-FormulaCell $doc 'Q17' $formula 'Qual email' 'str' 58
  Set-Dimension $doc 'A1:Q60'
  Set-VisibleArea $doc 'P2' 'N1'
}

if (Test-Path $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
New-Item -ItemType Directory -Path $tempRoot | Out-Null
[System.IO.Compression.ZipFile]::ExtractToDirectory($sourcePath, $tempRoot)

$sheet1Path = Join-Path $tempRoot 'xl\worksheets\sheet1.xml'
$sheet2Path = Join-Path $tempRoot 'xl\worksheets\sheet2.xml'
$sheet3Path = Join-Path $tempRoot 'xl\worksheets\sheet3.xml'

$sheet1 = Get-WorksheetDoc $sheet1Path
$sheet2 = Get-WorksheetDoc $sheet2Path
$sheet3 = Get-WorksheetDoc $sheet3Path

Add-CatiBlock $sheet1
Add-CawiBlock $sheet2
Add-QualBlock $sheet3

$sheet1.Save($sheet1Path)
$sheet2.Save($sheet2Path)
$sheet3.Save($sheet3Path)

if (Test-Path $outputPath) { Remove-Item -LiteralPath $outputPath -Force }
$zipOut = [System.IO.Compression.ZipFile]::Open($outputPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  Get-ChildItem -LiteralPath $tempRoot -Recurse -File | ForEach-Object {
    $relative = $_.FullName.Substring($tempRoot.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zipOut, $_.FullName, $relative) | Out-Null
  }
} finally {
  $zipOut.Dispose()
}

[pscustomobject]@{ Output = $outputPath } | ConvertTo-Json

