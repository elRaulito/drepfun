use aiken/collection/list
use cardano/address.{Inline, VerificationKey}
use cardano/assets.{quantity_of}
use cardano/certificate.{Certificate}
use cardano/governance.{ProposalProcedure, Voter}
use cardano/transaction.{Input, Transaction}

validator drep {
  publish(_redeemer: Data, _certificate: Certificate, tx: Transaction) {
    is_nft_owner(tx)
  }

  vote(_redeemer: Data, _voter: Voter, tx: Transaction) {
    is_nft_owner(tx)
  }

  propose(_redeemer: Data, _proposal: ProposalProcedure, tx: Transaction) {
    is_nft_owner(tx)
  }

  else(_) {
    fail
  }
}

pub fn is_nft_owner(tx: Transaction) {
  expect Some(referenceInput) = list.at(tx.reference_inputs, 0)

  expect Some(cred) = referenceInput.output.address.stake_credential
  expect Inline(stake_key_hash) = cred
  expect VerificationKey(hash) = stake_key_hash

  and {
    quantity_of(
      referenceInput.output.value,
      #"4523c5e21d409b81c95b45b0aea275b8ea1406e6cafea5583b9f8a5f",
      #"000de14042756438383632",
    ) == 1,
    list.has(tx.extra_signatories, hash),
  }
}
