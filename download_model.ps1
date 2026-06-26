# 途中でエラーが発生した場合、後続処理を続けず終了する。
$ErrorActionPreference = "Stop"

# MediaPipe公式配布先と、保存するファイル名。
$url = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task"
$out = "face_landmarker.task"

# 古いモデルがある場合は削除してからダウンロードし直す。
if (Test-Path $out) {
    Remove-Item $out
}

# 指定URLからモデルファイルを取得する。
Write-Host "Downloading face_landmarker.task ..."
Invoke-WebRequest -Uri $url -OutFile $out

# ダウンロードされたファイルサイズを確認する。
$size = (Get-Item $out).Length

# 0バイトなら正常なモデルではないため失敗として終了する。
if ($size -eq 0) {
    Write-Host "Download failed: file size is 0 byte."
    exit 1
}

Write-Host "Download complete: $out"
Write-Host "Size: $size bytes"
