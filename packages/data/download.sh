#!/bin/bash
set -e
mkdir -p raw

echo "Downloading OpenSanctions sanctions CSV..."
curl -L -o raw/sanctions.csv \
  "https://data.opensanctions.org/datasets/latest/sanctions/targets.simple.csv"

echo "Downloading ICIJ Offshore Leaks..."
curl -L -o raw/icij.zip \
  "https://offshoreleaks-data.icij.org/offshoreleaks/csv/full-oldb.LATEST.zip"

echo "Extracting ICIJ..."
cd raw && unzip -o icij.zip && cd ..

echo "Done."
