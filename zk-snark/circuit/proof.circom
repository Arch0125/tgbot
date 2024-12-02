include "circomlib/poseidon.circom";

template SimpleValidation() {
    signal input private_key;
    signal input action_data;
    signal input public_action_id;
    signal output is_valid;

    component hash = Poseidon(2);
    hash.inputs[0] <== private_key;
    hash.inputs[1] <== action_data;

    signal difference;
    difference <== hash.out - public_action_id;

    is_valid <== 1 - (difference * difference);
}

component main = SimpleValidation();
