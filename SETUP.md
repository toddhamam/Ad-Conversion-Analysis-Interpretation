# Setup Instructions for Mac

## One-Command Setup

Open your Terminal and paste this entire block, then press Enter:

```bash
# Check if Homebrew is installed, if not, install it
if ! command -v brew &> /dev/null; then
    echo "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

    # Add Homebrew to PATH for M1/M2 Macs
    if [[ $(uname -m) == 'arm64' ]]; then
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
fi

# Install Node.js if not already installed
if ! command -v node &> /dev/null; then
    echo "Installing Node.js..."
    brew install node
fi

# Navigate to project and start
cd ~/Ad-Conversion-Analysis-Interpretation
npm install
npm run dev
```

After running this, open your browser to: **http://localhost:5175/**

## If You Already Have the Folder

If you already downloaded the project, just run:

```bash
cd ~/Ad-Conversion-Analysis-Interpretation
npm install
npm run dev
```

Then open: **http://localhost:5175/**
