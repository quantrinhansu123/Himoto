#!/usr/bin/env bash
# Run in the owner's authenticated Google Cloud Shell. No private key is created.
# Only this Firebase project and the named Vercel production project are granted.
set -euo pipefail
project='himoto-70f21'
number='1074135885293'
pool='himoto-vercel-fcm'
provider='vercel-production'
team='congs-projects-f25af77d'
account="himoto-fcm@${project}.iam.gserviceaccount.com"
subject="owner:${team}:project:himoto:environment:production"
issuer="https://oidc.vercel.com/${team}"
audience="https://vercel.com/${team}"
condition="assertion.sub == '${subject}'"
actual="$(gcloud projects describe "$project" --format='value(projectNumber)')"
if [[ "$actual" != "$number" ]]; then echo 'STOP: unexpected Google project number'; exit 1; fi
gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com fcm.googleapis.com --project="$project"
if ! gcloud iam service-accounts describe "$account" --project="$project" >/dev/null 2>&1; then
  gcloud iam service-accounts create himoto-fcm --display-name='Himoto Android FCM sender' --project="$project"
fi
gcloud projects add-iam-policy-binding "$project" --member="serviceAccount:${account}" --role='roles/firebasecloudmessaging.admin' --condition=None --quiet
if ! gcloud iam workload-identity-pools describe "$pool" --location=global --project="$project" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$pool" --location=global --display-name='Himoto Vercel FCM' --project="$project"
fi
if gcloud iam workload-identity-pools providers describe "$provider" --workload-identity-pool="$pool" --location=global --project="$project" >/dev/null 2>&1; then
  existing_issuer="$(gcloud iam workload-identity-pools providers describe "$provider" --workload-identity-pool="$pool" --location=global --project="$project" --format='value(oidc.issuerUri)')"
  existing_condition="$(gcloud iam workload-identity-pools providers describe "$provider" --workload-identity-pool="$pool" --location=global --project="$project" --format='value(attributeCondition)')"
  if [[ "$existing_issuer" != "$issuer" || "$existing_condition" != "$condition" ]]; then
    echo 'STOP: existing provider differs; no trust policy was overwritten'; exit 1
  fi
else
  gcloud iam workload-identity-pools providers create-oidc "$provider" --project="$project" --location=global \
    --workload-identity-pool="$pool" --display-name='Himoto production only' \
    --issuer-uri="$issuer" --allowed-audiences="$audience" \
    --attribute-mapping='google.subject=assertion.sub' --attribute-condition="$condition"
fi
gcloud iam service-accounts add-iam-policy-binding "$account" --project="$project" \
  --role='roles/iam.workloadIdentityUser' \
  --member="principal://iam.googleapis.com/projects/${number}/locations/global/workloadIdentityPools/${pool}/subject/${subject}" --quiet
echo 'HIMOTO_FCM_WIF_READY'
printf 'GCP_PROJECT_ID=%s\nGCP_PROJECT_NUMBER=%s\nGCP_SERVICE_ACCOUNT_EMAIL=%s\nGCP_WORKLOAD_IDENTITY_POOL_ID=%s\nGCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID=%s\n' "$project" "$number" "$account" "$pool" "$provider"
