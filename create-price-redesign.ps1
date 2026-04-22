$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression.FileSystem

$sourcePath = 'C:\Users\User\Documents\javascript-sprint\price-calculator-redesign-source.xlsx'
$outputPath = 'C:\Users\User\Documents\javascript-sprint\price-calculator-redesign.xlsx'
$tempRoot = Join-Path $env:TEMP ('price-redesign-' + [guid]::NewGuid().ToString('N'))

function Escape-Xml([string]$value) {
  if ($null -eq $value) { return '' }
  return [System.Security.SecurityElement]::Escape($value)
}

function Get-WorksheetDoc([string]$path) {
  $doc = New-Object System.Xml.XmlDocument
  $doc.PreserveWhitespace = $true
  $doc.Load($path)
  return $doc
}

function Get-CellNode($doc, [string]$ref) {
  $nsmgr = New-Object System.Xml.XmlNamespaceManager($doc.NameTable)
  $nsmgr.AddNamespace('x', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
  return $doc.SelectSingleNode("//x:c[@r='$ref']", $nsmgr)
}

function Set-FormulaCell($doc, [string]$ref, [string]$formula, [string]$value, [string]$type = $null) {
  $cell = Get-CellNode $doc $ref
  if (-not $cell) {
    throw "Cell $ref not found."
  }

  while ($cell.HasChildNodes) {
    $cell.RemoveChild($cell.FirstChild) | Out-Null
  }

  if ($type) {
    if ($cell.Attributes['t']) {
      $cell.Attributes['t'].Value = $type
    } else {
      $attr = $doc.CreateAttribute('t')
      $attr.Value = $type
      $cell.Attributes.Append($attr) | Out-Null
    }
  } elseif ($cell.Attributes['t']) {
    $cell.Attributes.RemoveNamedItem('t') | Out-Null
  }

  $f = $doc.CreateElement('f', $doc.DocumentElement.NamespaceURI)
  $f.InnerText = $formula
  $cell.AppendChild($f) | Out-Null

  $v = $doc.CreateElement('v', $doc.DocumentElement.NamespaceURI)
  $v.InnerText = $value
  $cell.AppendChild($v) | Out-Null
}

function Build-BuilderSheetXml {
  $rows = New-Object System.Collections.Generic.List[string]

  function Add-Row([int]$rowNumber, [string[]]$cells) {
    $rows.Add("<row r=`"$rowNumber`">" + ($cells -join '') + "</row>")
  }

  function InlineCell([string]$ref, [string]$text) {
    return "<c r=`"$ref`" t=`"inlineStr`"><is><t>" + (Escape-Xml $text) + "</t></is></c>"
  }

  function NumberCell([string]$ref, [string]$value) {
    return "<c r=`"$ref`"><v>$value</v></c>"
  }

  function TextCell([string]$ref, [string]$value) {
    return "<c r=`"$ref`" t=`"str`"><v>" + (Escape-Xml $value) + "</v></c>"
  }

  function FormulaCell([string]$ref, [string]$formula, [string]$value, [string]$type = $null) {
    $typeAttr = if ($type) { " t=`"$type`"" } else { '' }
    return "<c r=`"$ref`"$typeAttr><f>" + (Escape-Xml $formula) + "</f><v>" + (Escape-Xml $value) + "</v></c>"
  }

  $summaryFormula = 'IF($E$4="CATI","Proposal for "&$B$4&": CATI in "&$B$9&", n="&TEXT($B$14,"0")&", LOI "&TEXT($B$12,"0")&" min, IR "&TEXT($B$13,"0%")&", total price "&TEXT($B$24,"EUR #,##0.00"),"Proposal for "&$B$4&": CAWI in "&$E$9&", n="&TEXT($E$15,"0")&", LOI "&TEXT($E$13,"0")&" min, IR "&TEXT($E$14,"0%")&", total price "&TEXT($B$24,"EUR #,##0.00"))'
  $subjectFormula = '"Proposal - "&$B$4&" - "&$E$4'
  $emailFormula = '"Hi "&IF($E$3<>"",$E$3,"there")&CHAR(10)&CHAR(10)&"Thank you for your request. Please find below our proposal for "&$B$4&"."&CHAR(10)&CHAR(10)&IF($E$4="CATI","Methodology: CATI"&CHAR(10)&"Country: "&$B$9&CHAR(10)&"Sample size: "&TEXT($B$14,"0")&CHAR(10)&"LOI: "&TEXT($B$12,"0")&" min"&CHAR(10)&"Incidence rate: "&TEXT($B$13,"0%"),"Methodology: CAWI"&CHAR(10)&"Country: "&$E$9&CHAR(10)&"Sample size: "&TEXT($E$15,"0")&CHAR(10)&"LOI: "&TEXT($E$13,"0")&" min"&CHAR(10)&"Incidence rate: "&TEXT($E$14,"0%"))&CHAR(10)&CHAR(10)&"Total proposed price: "&TEXT($B$24,"EUR #,##0.00")&CHAR(10)&"Price per complete: "&TEXT($B$25,"EUR #,##0.00")&CHAR(10)&CHAR(10)&"Please let me know if you would like us to prepare an updated version with any changes to sample size, LOI or targeting."&CHAR(10)&CHAR(10)&"Best regards,"'

  Add-Row 1 @(
    (InlineCell 'A1' 'PRICE CALCULATOR - PROPOSAL BUILDER')
  )

  Add-Row 3 @(
    (InlineCell 'A3' 'Client name'),
    (TextCell 'B3' 'Client'),
    (InlineCell 'D3' 'Contact name'),
    (TextCell 'E3' 'there')
  )

  Add-Row 4 @(
    (InlineCell 'A4' 'Project name'),
    (TextCell 'B4' 'Project'),
    (InlineCell 'D4' 'Methodology'),
    (TextCell 'E4' 'CATI')
  )

  Add-Row 6 @(
    (InlineCell 'A6' 'Fill in either the CATI or CAWI block below. The proposal output will follow the methodology in E4.')
  )

  Add-Row 8 @(
    (InlineCell 'A8' 'CATI INPUTS'),
    (InlineCell 'D8' 'CAWI INPUTS')
  )

  Add-Row 9 @(
    (InlineCell 'A9' 'Country'),
    (TextCell 'B9' 'ESTONIA'),
    (InlineCell 'D9' 'Country'),
    (TextCell 'E9' 'ESTONIA')
  )

  Add-Row 10 @(
    (InlineCell 'A10' 'Currency'),
    (TextCell 'B10' 'EUR'),
    (InlineCell 'D10' 'Currency'),
    (TextCell 'E10' 'EUR')
  )

  Add-Row 11 @(
    (InlineCell 'A11' 'Client type'),
    (TextCell 'B11' 'MEDIUM'),
    (InlineCell 'D11' 'Client type'),
    (TextCell 'E11' 'MEDIUM')
  )

  Add-Row 12 @(
    (InlineCell 'A12' 'LOI (minutes)'),
    (NumberCell 'B12' '10'),
    (InlineCell 'D12' 'Method'),
    (TextCell 'E12' 'WEBP')
  )

  Add-Row 13 @(
    (InlineCell 'A13' 'Incidence rate'),
    (NumberCell 'B13' '0.25'),
    (InlineCell 'D13' 'LOI (minutes)'),
    (NumberCell 'E13' '10')
  )

  Add-Row 14 @(
    (InlineCell 'A14' 'Sample size / completes'),
    (NumberCell 'B14' '150'),
    (InlineCell 'D14' 'Incidence rate'),
    (NumberCell 'E14' '0.95')
  )

  Add-Row 15 @(
    (InlineCell 'A15' 'Bi-lingual (Y/N)'),
    (TextCell 'B15' 'Y'),
    (InlineCell 'D15' 'Sample size / completes'),
    (NumberCell 'E15' '1000')
  )

  Add-Row 16 @(
    (InlineCell 'A16' 'Translation (Y/N)'),
    (TextCell 'B16' 'N'),
    (InlineCell 'D16' 'Bi-lingual (Y/N)'),
    (TextCell 'E16' 'Y')
  )

  Add-Row 17 @(
    (InlineCell 'A17' 'Coding / nr of questions'),
    (NumberCell 'B17' '0'),
    (InlineCell 'D17' 'Translation (Y/N)'),
    (TextCell 'E17' 'N')
  )

  Add-Row 18 @(
    (InlineCell 'A18' 'Database BT/Okredo (Y/N)'),
    (TextCell 'B18' 'Y'),
    (InlineCell 'D18' 'Coding / nr of questions'),
    (NumberCell 'E18' '0')
  )

  Add-Row 19 @(
    (InlineCell 'A19' 'Dashboard Lite (Y/N)'),
    (TextCell 'B19' 'N'),
    (InlineCell 'D19' 'Dashboard Lite (Y/N)'),
    (TextCell 'E19' 'N')
  )

  Add-Row 20 @(
    (InlineCell 'A20' 'Extra quotas'),
    (TextCell 'B20' '0 - USE STANDARD')
  )

  Add-Row 22 @(
    (InlineCell 'A22' 'PROPOSAL OUTPUT')
  )

  Add-Row 23 @(
    (InlineCell 'A23' 'Selected methodology'),
    (FormulaCell 'B23' '$E$4' 'CATI' 'str')
  )

  Add-Row 24 @(
    (InlineCell 'A24' 'Total selling price'),
    (FormulaCell 'B24' 'IF($E$4="CATI",CATI!F29,CAWI!F24)' '1980.7691088640834')
  )

  Add-Row 25 @(
    (InlineCell 'A25' 'Price per complete'),
    (FormulaCell 'B25' 'IF($E$4="CATI",CATI!F31,CAWI!F25)' '13.205127392427222')
  )

  Add-Row 26 @(
    (InlineCell 'A26' 'Internal cost'),
    (FormulaCell 'B26' 'IF($E$4="CATI",CATI!D29,CAWI!D24)' '886.24380196134814')
  )

  Add-Row 27 @(
    (InlineCell 'A27' 'Gross margin'),
    (FormulaCell 'B27' 'IF($E$4="CATI",CATI!F32,CAWI!F26)' '1094.5253069027353')
  )

  Add-Row 28 @(
    (InlineCell 'A28' 'Gross margin %'),
    (FormulaCell 'B28' 'IF($E$4="CATI",CATI!F33,CAWI!F27)' '0.5525759171044502')
  )

  Add-Row 29 @(
    (InlineCell 'A29' 'Proposal summary'),
    (FormulaCell 'B29' $summaryFormula 'Proposal for Project: CATI in ESTONIA, n=150, LOI 10 min, IR 25%, total price EUR 1,980.77' 'str')
  )

  Add-Row 31 @(
    (InlineCell 'A31' 'Email subject'),
    (FormulaCell 'B31' $subjectFormula 'Proposal - Project - CATI' 'str')
  )

  Add-Row 32 @(
    (InlineCell 'A32' 'Email draft'),
    (FormulaCell 'B32' $emailFormula "Hi there`n`nThank you for your request." 'str')
  )

  Add-Row 34 @(
    (InlineCell 'A34' 'Project management'),
    (FormulaCell 'B34' 'IF($E$4="CATI",CATI!F19,CAWI!F17)' '152.47687455000005')
  )

  Add-Row 35 @(
    (InlineCell 'A35' 'Data processing'),
    (FormulaCell 'B35' 'IF($E$4="CATI",CATI!F20,CAWI!F18)' '174.31401487500008')
  )

  Add-Row 36 @(
    (InlineCell 'A36' 'Fieldwork / incentives'),
    (FormulaCell 'B36' 'IF($E$4="CATI",CATI!F21,CAWI!F19)' '1473.5255971890831')
  )

  Add-Row 37 @(
    (InlineCell 'A37' 'System / platform'),
    (FormulaCell 'B37' 'IF($E$4="CATI",CATI!F22,CAWI!F20)' '80.452622250000033')
  )

  $sheetData = $rows -join ''

  return @"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:E37"/>
  <sheetViews>
    <sheetView workbookViewId="0"/>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <sheetData>$sheetData</sheetData>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>
"@
}

if (Test-Path $tempRoot) {
  Remove-Item -LiteralPath $tempRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $tempRoot | Out-Null

[System.IO.Compression.ZipFile]::ExtractToDirectory($sourcePath, $tempRoot)

$workbookPath = Join-Path $tempRoot 'xl\workbook.xml'
$workbookRelsPath = Join-Path $tempRoot 'xl\_rels\workbook.xml.rels'
$contentTypesPath = Join-Path $tempRoot '[Content_Types].xml'
$sheet1Path = Join-Path $tempRoot 'xl\worksheets\sheet1.xml'
$sheet2Path = Join-Path $tempRoot 'xl\worksheets\sheet2.xml'
$sheet11Path = Join-Path $tempRoot 'xl\worksheets\sheet11.xml'
$calcChainPath = Join-Path $tempRoot 'xl\calcChain.xml'

$sheet1 = Get-WorksheetDoc $sheet1Path
$sheet2 = Get-WorksheetDoc $sheet2Path

$catiMap = @(
  @{ Ref = 'D2'; Formula = "'Proposal Builder'!`$B`$9"; Value = 'ESTONIA'; Type = 'str' },
  @{ Ref = 'D3'; Formula = "'Proposal Builder'!`$B`$10"; Value = 'EUR'; Type = 'str' },
  @{ Ref = 'D4'; Formula = "'Proposal Builder'!`$B`$11"; Value = 'MEDIUM'; Type = 'str' },
  @{ Ref = 'D5'; Formula = "'Proposal Builder'!`$B`$12"; Value = '10'; Type = $null },
  @{ Ref = 'D6'; Formula = "'Proposal Builder'!`$B`$13"; Value = '0.25'; Type = $null },
  @{ Ref = 'D8'; Formula = "'Proposal Builder'!`$B`$14"; Value = '150'; Type = $null },
  @{ Ref = 'D9'; Formula = "'Proposal Builder'!`$B`$15"; Value = 'Y'; Type = 'str' },
  @{ Ref = 'D10'; Formula = "'Proposal Builder'!`$B`$20"; Value = '0 - USE STANDARD'; Type = 'str' },
  @{ Ref = 'D11'; Formula = "'Proposal Builder'!`$B`$16"; Value = 'N'; Type = 'str' },
  @{ Ref = 'D12'; Formula = "'Proposal Builder'!`$B`$17"; Value = '0'; Type = $null },
  @{ Ref = 'D13'; Formula = "'Proposal Builder'!`$B`$18"; Value = 'Y'; Type = 'str' },
  @{ Ref = 'D14'; Formula = "'Proposal Builder'!`$B`$19"; Value = 'N'; Type = 'str' }
)

$cawiMap = @(
  @{ Ref = 'D2'; Formula = "'Proposal Builder'!`$E`$9"; Value = 'ESTONIA'; Type = 'str' },
  @{ Ref = 'D3'; Formula = "'Proposal Builder'!`$E`$10"; Value = 'EUR'; Type = 'str' },
  @{ Ref = 'D4'; Formula = "'Proposal Builder'!`$E`$11"; Value = 'MEDIUM'; Type = 'str' },
  @{ Ref = 'D5'; Formula = "'Proposal Builder'!`$E`$12"; Value = 'WEBP'; Type = 'str' },
  @{ Ref = 'D6'; Formula = "'Proposal Builder'!`$E`$13"; Value = '10'; Type = $null },
  @{ Ref = 'D7'; Formula = "'Proposal Builder'!`$E`$14"; Value = '0.95'; Type = $null },
  @{ Ref = 'D8'; Formula = "'Proposal Builder'!`$E`$15"; Value = '1000'; Type = $null },
  @{ Ref = 'D9'; Formula = "'Proposal Builder'!`$E`$16"; Value = 'Y'; Type = 'str' },
  @{ Ref = 'D10'; Formula = "'Proposal Builder'!`$E`$17"; Value = 'N'; Type = 'str' },
  @{ Ref = 'D11'; Formula = "'Proposal Builder'!`$E`$18"; Value = '0'; Type = $null },
  @{ Ref = 'D12'; Formula = "'Proposal Builder'!`$E`$19"; Value = 'N'; Type = 'str' }
)

foreach ($item in $catiMap) {
  Set-FormulaCell $sheet1 $item.Ref $item.Formula $item.Value $item.Type
}

foreach ($item in $cawiMap) {
  Set-FormulaCell $sheet2 $item.Ref $item.Formula $item.Value $item.Type
}

$sheet1.Save($sheet1Path)
$sheet2.Save($sheet2Path)

[System.IO.File]::WriteAllText($sheet11Path, (Build-BuilderSheetXml), [System.Text.Encoding]::UTF8)

$workbookText = Get-Content -LiteralPath $workbookPath -Raw
$workbookText = $workbookText -replace '<workbookView ([^>]*?)activeTab="[^"]+"', '<workbookView $1activeTab="0"'
$workbookText = $workbookText -replace '<sheets>', '<sheets><sheet name="Proposal Builder" sheetId="12" r:id="rId62"/>'
$workbookText = $workbookText -replace '<calcPr calcId="191029"/>', '<calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/>'
Set-Content -LiteralPath $workbookPath -Value $workbookText -Encoding UTF8

$relsText = Get-Content -LiteralPath $workbookRelsPath -Raw
$relsText = $relsText -replace '<Relationship Id="rId61" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/calcChain" Target="calcChain.xml"/>', ''
$relsText = $relsText -replace '</Relationships>', '<Relationship Id="rId62" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet11.xml"/></Relationships>'
Set-Content -LiteralPath $workbookRelsPath -Value $relsText -Encoding UTF8

$contentTypesText = Get-Content -LiteralPath $contentTypesPath -Raw
$contentTypesText = $contentTypesText -replace '<Override PartName="/xl/calcChain.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain\+xml"/>', ''
$contentTypesText = $contentTypesText -replace '</Types>', '<Override PartName="/xl/worksheets/sheet11.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'
Set-Content -LiteralPath $contentTypesPath -Value $contentTypesText -Encoding UTF8

if (Test-Path $calcChainPath) {
  Remove-Item -LiteralPath $calcChainPath -Force
}

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
