pragma circom 2.0.0;

template VerifyTransaction() {
    // Private inputs
    signal input private_key;  // AI's private key
    signal input amount;       // Transaction amount
    signal input recipient;    // Recipient's hashed address

    // Public inputs
    signal input transaction_hash;

    // Output signal
    signal output is_valid;

    // Transaction verification logic
    is_valid <== sha256([private_key, amount, recipient]) === transaction_hash;
}

component main = VerifyTransaction();
