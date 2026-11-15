# Review Diagrams: Iteration 001

**Schema**: v1
**Diagram Format**: mermaid

> **⚠️ Review Evidence Warning** _(Form-vs-Meaning Gap Detected)_
>
> This iteration's task tracking declares **19 completed task(s)**, but the git diff against baseline `ae40fa10981259acab40787c0b60e38366a1cdde` contains **393 file(s)**.
>
> **Severity**: WARNING
> **Implication**: Review evidence may be incomplete or misleading.
>
> **Possible causes**:
>
> - Implementation work was not committed before scaffolding review artifacts
> - Task status markers in plan.md or review.md do not match actual progress
> - Baseline reference in state.md is stale or incorrect
>
> **Remediation**:
>
> 1. Verify implementation is committed: `git diff ae40fa10981259acab40787c0b60e38366a1cdde...HEAD --stat`
> 2. If uncommitted work exists: `git add . && git commit -m "Implementation complete"`
> 3. Re-run scaffolder with `-Force` flag to regenerate review artifacts after commit
> 4. Re-run `validate-governance.ps1` to clear pre-review commit gate error
>
> _See Proposal 073 (Review Evidence Integrity) for background on this validation._

---

## Structure Diagram

```mermaid
flowchart LR
  bridge_dev_admin_pages["bridge/dev/admin-pages"]
  bridge_dev_all_in_one_scenario["bridge/dev/all-in-one-scenario"]
  bridge_src_connector_access_outbox_store_index["bridge/src/connector/access/outbox-store/index"]
  bridge_src_connector_access_outbox_store_outbox_migrations["bridge/src/connector/access/outbox-store/outbox-migrations"]
  bridge_src_connector_access_outbox_store_outbox_store_error["bridge/src/connector/access/outbox-store/outbox-store-error"]
  bridge_src_connector_access_outbox_store_outbox_store["bridge/src/connector/access/outbox-store/outbox-store"]
  bridge_src_connector_access_ring_adapter_alarm_devices["bridge/src/connector/access/ring-adapter/alarm-devices"]
  bridge_src_connector_access_ring_adapter_call_limits["bridge/src/connector/access/ring-adapter/call-limits"]
  bridge_src_connector_access_ring_adapter_hub_sessions["bridge/src/connector/access/ring-adapter/hub-sessions"]
  bridge_src_connector_access_ring_adapter_index["bridge/src/connector/access/ring-adapter/index"]
  bridge_src_connector_access_ring_adapter_ring_adapter_error["bridge/src/connector/access/ring-adapter/ring-adapter-error"]
  bridge_src_connector_access_ring_adapter_ring_api_adapter["bridge/src/connector/access/ring-adapter/ring-api-adapter"]
  bridge_src_connector_access_ring_adapter_ring_client_live["bridge/src/connector/access/ring-adapter/ring-client.live"]
  bridge_src_connector_access_ring_adapter_ring_client["bridge/src/connector/access/ring-adapter/ring-client"]
  bridge_src_connector_access_ring_adapter_ring_failure["bridge/src/connector/access/ring-adapter/ring-failure"]
  bridge_src_connector_access_ring_adapter_ring_library_live["bridge/src/connector/access/ring-adapter/ring-library.live"]
  bridge_src_connector_access_ring_adapter_ring_login_live["bridge/src/connector/access/ring-adapter/ring-login.live"]
  bridge_src_connector_access_ring_adapter_ring_login["bridge/src/connector/access/ring-adapter/ring-login"]
  bridge_src_connector_access_ring_adapter_ring_mapping["bridge/src/connector/access/ring-adapter/ring-mapping"]
  bridge_src_connector_access_ring_adapter_ring_port["bridge/src/connector/access/ring-adapter/ring-port"]
  bridge_src_connector_access_ring_adapter_room_lists["bridge/src/connector/access/ring-adapter/room-lists"]
  bridge_src_connector_access_secrets_file_index["bridge/src/connector/access/secrets-file/index"]
  bridge_src_connector_access_secrets_file_secrets_file_error["bridge/src/connector/access/secrets-file/secrets-file-error"]
  bridge_src_connector_access_secrets_file_secrets_file_key["bridge/src/connector/access/secrets-file/secrets-file-key"]
  bridge_src_connector_access_secrets_file_secrets_file["bridge/src/connector/access/secrets-file/secrets-file"]
  bridge_src_connector_clients_core_link_core_link["bridge/src/connector/clients/core-link/core-link"]
  bridge_src_connector_clients_core_link_home_session["bridge/src/connector/clients/core-link/home-session"]
  bridge_src_connector_clients_core_link_index["bridge/src/connector/clients/core-link/index"]
  bridge_src_connector_clients_core_link_messages_core_messages["bridge/src/connector/clients/core-link/messages/core-messages"]
  bridge_src_connector_clients_core_link_messages_index["bridge/src/connector/clients/core-link/messages/index"]
  bridge_src_connector_clients_home_scheduler_home_scheduler["bridge/src/connector/clients/home-scheduler/home-scheduler"]
  bridge_src_connector_clients_home_scheduler_index["bridge/src/connector/clients/home-scheduler/index"]
  bridge_src_connector_clients_setup_cli_enrollment_code["bridge/src/connector/clients/setup-cli/enrollment-code"]
  bridge_src_connector_clients_setup_cli_index["bridge/src/connector/clients/setup-cli/index"]
  bridge_src_connector_clients_setup_cli_setup_console["bridge/src/connector/clients/setup-cli/setup-console"]
  bridge_src_connector_clients_setup_cli_setup["bridge/src/connector/clients/setup-cli/setup"]
  bridge_src_connector_clients_setup_cli_terminal_console["bridge/src/connector/clients/setup-cli/terminal-console"]
  bridge_src_connector_managers_ingest_home_view["bridge/src/connector/managers/ingest/home-view"]
  bridge_src_connector_managers_ingest_index["bridge/src/connector/managers/ingest/index"]
  bridge_src_connector_managers_ingest_ingest["bridge/src/connector/managers/ingest/ingest"]
  bridge_src_contract_envelopes["bridge/src/contract/envelopes"]
  bridge_src_contract_index["bridge/src/contract/index"]
  bridge_src_contract_inquiry_tools["bridge/src/contract/inquiry-tools"]
  bridge_src_contract_json_schema["bridge/src/contract/json-schema"]
  bridge_src_contract_shapes["bridge/src/contract/shapes"]
  bridge_src_contract_untrusted["bridge/src/contract/untrusted"]
  bridge_src_core_access_grants_grants_store_error["bridge/src/core/access/grants/grants-store-error"]
  bridge_src_core_access_grants_grants_store["bridge/src/core/access/grants/grants-store"]
  bridge_src_core_access_grants_index["bridge/src/core/access/grants/index"]
  bridge_src_core_access_lease_index["bridge/src/core/access/lease/index"]
  bridge_src_core_access_lease_lease["bridge/src/core/access/lease/lease"]
  bridge_src_core_access_secrets_core_secrets["bridge/src/core/access/secrets/core-secrets"]
  bridge_src_core_access_secrets_index["bridge/src/core/access/secrets/index"]
  bridge_src_core_access_secrets_key_vault_client_live["bridge/src/core/access/secrets/key-vault-client.live"]
  bridge_src_core_access_secrets_key_vault_secrets["bridge/src/core/access/secrets/key-vault-secrets"]
  bridge_src_core_access_secrets_sealed_file_secrets["bridge/src/core/access/secrets/sealed-file-secrets"]
  bridge_src_core_access_secrets_secrets_error["bridge/src/core/access/secrets/secrets-error"]
  bridge_src_core_access_settings_index["bridge/src/core/access/settings/index"]
  bridge_src_core_access_settings_settings_store_error["bridge/src/core/access/settings/settings-store-error"]
  bridge_src_core_access_settings_settings_store["bridge/src/core/access/settings/settings-store"]
  bridge_src_core_access_state_index["bridge/src/core/access/state/index"]
  bridge_src_core_access_state_state_store_error["bridge/src/core/access/state/state-store-error"]
  bridge_src_core_access_state_state_store["bridge/src/core/access/state/state-store"]
  bridge_src_core_clients_connector_link_connector_link["bridge/src/core/clients/connector-link/connector-link"]
  bridge_src_core_clients_connector_link_core_session["bridge/src/core/clients/connector-link/core-session"]
  bridge_src_core_clients_connector_link_index["bridge/src/core/clients/connector-link/index"]
  bridge_src_core_clients_connector_link_intake_mapping["bridge/src/core/clients/connector-link/intake-mapping"]
  bridge_src_core_clients_connector_link_messages_home_messages["bridge/src/core/clients/connector-link/messages/home-messages"]
  bridge_src_core_clients_connector_link_messages_index["bridge/src/core/clients/connector-link/messages/index"]
  bridge_src_core_clients_issuer_bounded_fetch["bridge/src/core/clients/issuer/bounded-fetch"]
  bridge_src_core_clients_issuer_first_signing_key["bridge/src/core/clients/issuer/first-signing-key"]
  bridge_src_core_clients_issuer_grants_adapter["bridge/src/core/clients/issuer/grants-adapter"]
  bridge_src_core_clients_issuer_index["bridge/src/core/clients/issuer/index"]
  bridge_src_core_clients_issuer_issuer_error["bridge/src/core/clients/issuer/issuer-error"]
  bridge_src_core_clients_issuer_issuer["bridge/src/core/clients/issuer/issuer"]
  bridge_src_core_clients_issuer_listed_agents["bridge/src/core/clients/issuer/listed-agents"]
  bridge_src_core_clients_issuer_pending_sign_ins["bridge/src/core/clients/issuer/pending-sign-ins"]
  bridge_src_core_clients_issuer_provider_configuration["bridge/src/core/clients/issuer/provider-configuration"]
  bridge_src_core_clients_issuer_registration_limit["bridge/src/core/clients/issuer/registration-limit"]
  bridge_src_core_clients_issuer_signing_keys["bridge/src/core/clients/issuer/signing-keys"]
  bridge_src_core_clients_mcp_endpoint_index["bridge/src/core/clients/mcp-endpoint/index"]
  bridge_src_core_clients_mcp_endpoint_listed_input["bridge/src/core/clients/mcp-endpoint/listed-input"]
  bridge_src_core_clients_mcp_endpoint_mcp_endpoint["bridge/src/core/clients/mcp-endpoint/mcp-endpoint"]
  bridge_src_core_clients_mcp_endpoint_read_limit["bridge/src/core/clients/mcp-endpoint/read-limit"]
  bridge_src_core_clients_mcp_endpoint_read_tools["bridge/src/core/clients/mcp-endpoint/read-tools"]
  bridge_src_core_clients_web_admin_sign_ins["bridge/src/core/clients/web/admin-sign-ins"]
  bridge_src_core_clients_web_cookies["bridge/src/core/clients/web/cookies"]
  bridge_src_core_clients_web_health_panel["bridge/src/core/clients/web/health-panel"]
  bridge_src_core_clients_web_index["bridge/src/core/clients/web/index"]
  bridge_src_core_clients_web_owner_sessions["bridge/src/core/clients/web/owner-sessions"]
  bridge_src_core_clients_web_page_script["bridge/src/core/clients/web/page-script"]
  bridge_src_core_clients_web_pages["bridge/src/core/clients/web/pages"]
  bridge_src_core_clients_web_styles["bridge/src/core/clients/web/styles"]
  bridge_src_core_clients_web_web["bridge/src/core/clients/web/web"]
  bridge_src_core_engines_health_health_engine["bridge/src/core/engines/health/health-engine"]
  bridge_src_core_engines_health_index["bridge/src/core/engines/health/index"]
  bridge_src_core_engines_summary_index["bridge/src/core/engines/summary/index"]
  bridge_src_core_engines_summary_summary_engine["bridge/src/core/engines/summary/summary-engine"]
  bridge_src_core_managers_admin_admin_error["bridge/src/core/managers/admin/admin-error"]
  bridge_src_core_managers_admin_admin_manager["bridge/src/core/managers/admin/admin-manager"]
  bridge_src_core_managers_admin_index["bridge/src/core/managers/admin/index"]
  bridge_src_core_managers_event_event_error["bridge/src/core/managers/event/event-error"]
  bridge_src_core_managers_event_event_intake["bridge/src/core/managers/event/event-intake"]
  bridge_src_core_managers_event_event_manager["bridge/src/core/managers/event/event-manager"]
  bridge_src_core_managers_event_index["bridge/src/core/managers/event/index"]
  bridge_src_core_managers_inquiry_index["bridge/src/core/managers/inquiry/index"]
  bridge_src_core_managers_inquiry_inquiry_error["bridge/src/core/managers/inquiry/inquiry-error"]
  bridge_src_core_managers_inquiry_inquiry_manager["bridge/src/core/managers/inquiry/inquiry-manager"]
  bridge_src_host_all_in_one["bridge/src/host/all-in-one"]
  bridge_src_host_connector_health["bridge/src/host/connector-health"]
  bridge_src_host_connector["bridge/src/host/connector"]
  bridge_src_host_core_assembly["bridge/src/host/core-assembly"]
  bridge_src_host_core_service["bridge/src/host/core-service"]
  bridge_src_host_core["bridge/src/host/core"]
  bridge_src_host_first_signing_key["bridge/src/host/first-signing-key"]
  bridge_src_host_home_assembly["bridge/src/host/home-assembly"]
  bridge_src_host_home_files["bridge/src/host/home-files"]
  bridge_src_host_host_error["bridge/src/host/host-error"]
  bridge_src_host_leased_links["bridge/src/host/leased-links"]
  bridge_src_host_main["bridge/src/host/main"]
  bridge_src_host_ring_home_live["bridge/src/host/ring-home.live"]
  bridge_src_host_setup["bridge/src/host/setup"]
  bridge_src_host_version["bridge/src/host/version"]
  bridge_src_types_oidc_provider_d["bridge/src/types/oidc-provider.d"]
  bridge_src_utilities_clock_clock_error["bridge/src/utilities/clock/clock-error"]
  bridge_src_utilities_clock_clock["bridge/src/utilities/clock/clock"]
  bridge_src_utilities_clock_fake_clock["bridge/src/utilities/clock/fake-clock"]
  bridge_src_utilities_clock_index["bridge/src/utilities/clock/index"]
  bridge_src_utilities_clock_time_format["bridge/src/utilities/clock/time-format"]
  bridge_src_utilities_config_config_error["bridge/src/utilities/config/config-error"]
  bridge_src_utilities_config_index["bridge/src/utilities/config/index"]
  bridge_src_utilities_config_mode_settings["bridge/src/utilities/config/mode-settings"]
  bridge_src_utilities_config_section["bridge/src/utilities/config/section"]
  bridge_src_utilities_config_settings["bridge/src/utilities/config/settings"]
  bridge_src_utilities_link_transport_dial_link["bridge/src/utilities/link-transport/dial-link"]
  bridge_src_utilities_link_transport_index["bridge/src/utilities/link-transport/index"]
  bridge_src_utilities_link_transport_link_connection["bridge/src/utilities/link-transport/link-connection"]
  bridge_src_utilities_link_transport_link_frame["bridge/src/utilities/link-transport/link-frame"]
  bridge_src_utilities_link_transport_link_pair["bridge/src/utilities/link-transport/link-pair"]
  bridge_src_utilities_link_transport_link_server["bridge/src/utilities/link-transport/link-server"]
  bridge_src_utilities_link_transport_link_slot["bridge/src/utilities/link-transport/link-slot"]
  bridge_src_utilities_link_transport_send_queue["bridge/src/utilities/link-transport/send-queue"]
  bridge_src_utilities_link_transport_socket_link["bridge/src/utilities/link-transport/socket-link"]
  bridge_src_utilities_logging_format_line["bridge/src/utilities/logging/format-line"]
  bridge_src_utilities_logging_index["bridge/src/utilities/logging/index"]
  bridge_src_utilities_logging_log_fields["bridge/src/utilities/logging/log-fields"]
  bridge_src_utilities_logging_logger["bridge/src/utilities/logging/logger"]
  bridge_src_utilities_logging_redaction["bridge/src/utilities/logging/redaction"]
  bridge_src_utilities_logging_serialize_error["bridge/src/utilities/logging/serialize-error"]
  bridge_src_utilities_logging_stdout_sink["bridge/src/utilities/logging/stdout-sink"]
  bridge_src_utilities_pub_sub_index["bridge/src/utilities/pub-sub/index"]
  bridge_src_utilities_pub_sub_pub_sub["bridge/src/utilities/pub-sub/pub-sub"]
  bridge_src_utilities_query_layer_index["bridge/src/utilities/query-layer/index"]
  bridge_src_utilities_query_layer_migrations_0001_iteration_001_schema["bridge/src/utilities/query-layer/migrations/0001-iteration-001-schema"]
  bridge_src_utilities_query_layer_migrations_0002_connector_enrollment_code["bridge/src/utilities/query-layer/migrations/0002-connector-enrollment-code"]
  bridge_src_utilities_query_layer_migrations_0003_one_pending_enrollment["bridge/src/utilities/query-layer/migrations/0003-one-pending-enrollment"]
  bridge_src_utilities_query_layer_migrations_0004_state_source["bridge/src/utilities/query-layer/migrations/0004-state-source"]
  bridge_src_utilities_query_layer_migrations_0005_snapshot_order["bridge/src/utilities/query-layer/migrations/0005-snapshot-order"]
  bridge_src_utilities_query_layer_migrations_0006_motion_since["bridge/src/utilities/query-layer/migrations/0006-motion-since"]
  bridge_src_utilities_query_layer_migrations_core_migrations["bridge/src/utilities/query-layer/migrations/core-migrations"]
  bridge_src_utilities_query_layer_migrations_migration["bridge/src/utilities/query-layer/migrations/migration"]
  bridge_src_utilities_query_layer_migrations_run_migrations["bridge/src/utilities/query-layer/migrations/run-migrations"]
  bridge_src_utilities_query_layer_parameters["bridge/src/utilities/query-layer/parameters"]
  bridge_src_utilities_query_layer_query_layer_error["bridge/src/utilities/query-layer/query-layer-error"]
  bridge_src_utilities_query_layer_query_layer["bridge/src/utilities/query-layer/query-layer"]
  bridge_src_utilities_query_layer_serial_queue["bridge/src/utilities/query-layer/serial-queue"]
  bridge_src_utilities_query_layer_sql_driver["bridge/src/utilities/query-layer/sql-driver"]
  bridge_src_utilities_query_layer_sql_types["bridge/src/utilities/query-layer/sql-types"]
  bridge_src_utilities_query_layer_sqlite["bridge/src/utilities/query-layer/sqlite"]
  bridge_src_utilities_query_layer_statements["bridge/src/utilities/query-layer/statements"]
  bridge_src_utilities_query_layer_tsql_managed_identity_live["bridge/src/utilities/query-layer/tsql-managed-identity.live"]
  bridge_src_utilities_query_layer_tsql["bridge/src/utilities/query-layer/tsql"]
  bridge_src_utilities_query_layer_until_aborted["bridge/src/utilities/query-layer/until-aborted"]
  bridge_src_utilities_security_atomic_write["bridge/src/utilities/security/atomic-write"]
  bridge_src_utilities_security_entra_discovery["bridge/src/utilities/security/entra-discovery"]
  bridge_src_utilities_security_entra_sign_in["bridge/src/utilities/security/entra-sign-in"]
  bridge_src_utilities_security_index["bridge/src/utilities/security/index"]
  bridge_src_utilities_security_managed_identity_assertion_live["bridge/src/utilities/security/managed-identity-assertion.live"]
  bridge_src_utilities_security_sealing["bridge/src/utilities/security/sealing"]
  bridge_src_utilities_security_secret["bridge/src/utilities/security/secret"]
  bridge_src_utilities_security_security_error["bridge/src/utilities/security/security-error"]
  bridge_src_utilities_security_signing["bridge/src/utilities/security/signing"]
  eslint_config["eslint.config"]
  infra_bootstrap_bootstrap["infra/bootstrap/bootstrap"]
  infra_home_convert_qcow2["infra/home/convert-qcow2"]
  infra_home_new_connector_vm["infra/home/new-connector-vm"]
  playwright_config["playwright.config"]
  vitest_config["vitest.config"]
  bridge_dev_admin_pages --> bridge_src_core_clients_web_index
  bridge_dev_admin_pages --> bridge_src_core_managers_admin_index
  bridge_dev_admin_pages --> bridge_src_core_managers_inquiry_index
  bridge_dev_admin_pages --> bridge_src_utilities_clock_index
  bridge_dev_admin_pages --> bridge_src_utilities_logging_index
  bridge_dev_admin_pages --> bridge_src_utilities_security_index
  bridge_dev_all_in_one_scenario --> bridge_src_host_all_in_one
  bridge_dev_all_in_one_scenario --> bridge_src_host_version
  bridge_dev_all_in_one_scenario --> bridge_src_utilities_clock_index
  bridge_dev_all_in_one_scenario --> bridge_src_utilities_config_index
  bridge_dev_all_in_one_scenario --> bridge_src_utilities_logging_index
  bridge_dev_all_in_one_scenario --> bridge_src_utilities_security_index
  bridge_src_connector_access_outbox_store_outbox_migrations --> bridge_src_utilities_query_layer_index
  bridge_src_connector_access_outbox_store_outbox_store --> bridge_src_utilities_clock_index
  bridge_src_connector_access_outbox_store_outbox_store --> bridge_src_connector_access_outbox_store_outbox_migrations
  bridge_src_connector_access_outbox_store_outbox_store --> bridge_src_connector_access_outbox_store_outbox_store_error
  bridge_src_connector_access_ring_adapter_call_limits --> bridge_src_utilities_clock_index
  bridge_src_connector_access_ring_adapter_call_limits --> bridge_src_connector_access_ring_adapter_ring_adapter_error
  bridge_src_connector_access_ring_adapter_hub_sessions --> bridge_src_utilities_clock_index
  bridge_src_connector_access_ring_adapter_hub_sessions --> bridge_src_utilities_logging_index
  bridge_src_connector_access_ring_adapter_ring_api_adapter --> bridge_src_utilities_clock_index
  bridge_src_connector_access_ring_adapter_ring_api_adapter --> bridge_src_utilities_logging_index
  bridge_src_connector_access_ring_adapter_ring_api_adapter --> bridge_src_utilities_security_index
  bridge_src_connector_access_ring_adapter_ring_api_adapter --> bridge_src_connector_access_ring_adapter_alarm_devices
  bridge_src_connector_access_ring_adapter_ring_api_adapter --> bridge_src_connector_access_ring_adapter_hub_sessions
  bridge_src_connector_access_ring_adapter_ring_api_adapter --> bridge_src_connector_access_ring_adapter_call_limits
  bridge_src_connector_access_ring_adapter_ring_api_adapter --> bridge_src_connector_access_ring_adapter_ring_adapter_error
  bridge_src_connector_access_ring_adapter_ring_api_adapter --> bridge_src_connector_access_ring_adapter_ring_failure
  bridge_src_connector_access_ring_adapter_ring_api_adapter --> bridge_src_connector_access_ring_adapter_room_lists
  bridge_src_connector_access_ring_adapter_ring_client_live --> bridge_src_connector_access_ring_adapter_ring_client
  bridge_src_connector_access_ring_adapter_ring_client_live --> bridge_src_connector_access_ring_adapter_ring_library_live
  bridge_src_connector_access_ring_adapter_ring_failure --> bridge_src_connector_access_ring_adapter_ring_adapter_error
  bridge_src_connector_access_ring_adapter_ring_login_live --> bridge_src_utilities_security_index
  bridge_src_connector_access_ring_adapter_ring_login_live --> bridge_src_connector_access_ring_adapter_ring_library_live
  bridge_src_connector_access_ring_adapter_ring_login_live --> bridge_src_connector_access_ring_adapter_ring_login
  bridge_src_connector_access_ring_adapter_ring_login --> bridge_src_utilities_security_index
  bridge_src_connector_access_ring_adapter_ring_mapping --> bridge_src_utilities_clock_index
  bridge_src_connector_access_secrets_file_secrets_file_key --> bridge_src_connector_access_secrets_file_secrets_file_error
  bridge_src_connector_access_secrets_file_secrets_file --> bridge_src_connector_access_secrets_file_secrets_file_error
  bridge_src_connector_clients_core_link_core_link --> bridge_src_utilities_clock_index
  bridge_src_connector_clients_core_link_core_link --> bridge_src_utilities_logging_index
  bridge_src_connector_clients_core_link_core_link --> bridge_src_utilities_security_index
  bridge_src_connector_clients_core_link_core_link --> bridge_src_connector_managers_ingest_index
  bridge_src_connector_clients_core_link_core_link --> bridge_src_connector_clients_core_link_home_session
  bridge_src_connector_clients_core_link_home_session --> bridge_src_utilities_clock_index
  bridge_src_connector_clients_core_link_home_session --> bridge_src_utilities_link_transport_index
  bridge_src_connector_clients_core_link_home_session --> bridge_src_utilities_logging_index
  bridge_src_connector_clients_core_link_home_session --> bridge_src_utilities_security_index
  bridge_src_connector_clients_core_link_home_session --> bridge_src_core_clients_connector_link_messages_index
  bridge_src_connector_clients_core_link_home_session --> bridge_src_connector_managers_ingest_index
  bridge_src_connector_clients_core_link_home_session --> bridge_src_connector_clients_core_link_messages_index
  bridge_src_connector_clients_core_link_messages_core_messages --> bridge_src_utilities_link_transport_index
  bridge_src_connector_clients_home_scheduler_home_scheduler --> bridge_src_utilities_clock_index
  bridge_src_connector_clients_home_scheduler_home_scheduler --> bridge_src_utilities_logging_index
  bridge_src_connector_clients_home_scheduler_home_scheduler --> bridge_src_connector_managers_ingest_index
  bridge_src_connector_clients_setup_cli_setup --> bridge_src_connector_access_ring_adapter_index
  bridge_src_connector_clients_setup_cli_setup --> bridge_src_connector_access_secrets_file_index
  bridge_src_connector_clients_setup_cli_setup --> bridge_src_utilities_clock_index
  bridge_src_connector_clients_setup_cli_setup --> bridge_src_connector_clients_setup_cli_enrollment_code
  bridge_src_connector_clients_setup_cli_setup --> bridge_src_connector_clients_setup_cli_setup_console
  bridge_src_connector_clients_setup_cli_terminal_console --> bridge_src_connector_clients_setup_cli_setup_console
  bridge_src_connector_managers_ingest_home_view --> bridge_src_utilities_clock_index
  bridge_src_connector_managers_ingest_ingest --> bridge_src_utilities_clock_index
  bridge_src_connector_managers_ingest_ingest --> bridge_src_utilities_logging_index
  bridge_src_connector_managers_ingest_ingest --> bridge_src_core_clients_connector_link_messages_index
  bridge_src_connector_managers_ingest_ingest --> bridge_src_connector_access_outbox_store_index
  bridge_src_connector_managers_ingest_ingest --> bridge_src_connector_access_ring_adapter_index
  bridge_src_connector_managers_ingest_ingest --> bridge_src_connector_managers_ingest_home_view
  bridge_src_contract_envelopes --> bridge_src_contract_shapes
  bridge_src_contract_inquiry_tools --> bridge_src_contract_envelopes
  bridge_src_contract_inquiry_tools --> bridge_src_contract_untrusted
  bridge_src_contract_json_schema --> bridge_src_contract_envelopes
  bridge_src_contract_json_schema --> bridge_src_contract_inquiry_tools
  bridge_src_contract_shapes --> bridge_src_contract_untrusted
  bridge_src_core_access_grants_grants_store --> bridge_src_utilities_clock_index
  bridge_src_core_access_grants_grants_store --> bridge_src_core_access_grants_grants_store_error
  bridge_src_core_access_lease_lease --> bridge_src_utilities_clock_index
  bridge_src_core_access_secrets_core_secrets --> bridge_src_utilities_security_index
  bridge_src_core_access_secrets_key_vault_client_live --> bridge_src_core_access_secrets_key_vault_secrets
  bridge_src_core_access_secrets_key_vault_secrets --> bridge_src_utilities_security_index
  bridge_src_core_access_secrets_key_vault_secrets --> bridge_src_core_access_secrets_core_secrets
  bridge_src_core_access_secrets_key_vault_secrets --> bridge_src_core_access_secrets_secrets_error
  bridge_src_core_access_secrets_sealed_file_secrets --> bridge_src_core_access_secrets_core_secrets
  bridge_src_core_access_secrets_sealed_file_secrets --> bridge_src_core_access_secrets_secrets_error
  bridge_src_core_access_settings_settings_store --> bridge_src_utilities_clock_index
  bridge_src_core_access_settings_settings_store --> bridge_src_utilities_security_index
  bridge_src_core_access_settings_settings_store --> bridge_src_core_access_settings_settings_store_error
  bridge_src_core_access_state_state_store --> bridge_src_core_access_state_state_store_error
  bridge_src_core_clients_connector_link_connector_link --> bridge_src_utilities_clock_index
  bridge_src_core_clients_connector_link_connector_link --> bridge_src_utilities_link_transport_index
  bridge_src_core_clients_connector_link_connector_link --> bridge_src_utilities_logging_index
  bridge_src_core_clients_connector_link_connector_link --> bridge_src_utilities_security_index
  bridge_src_core_clients_connector_link_connector_link --> bridge_src_core_managers_admin_index
  bridge_src_core_clients_connector_link_connector_link --> bridge_src_core_managers_event_index
  bridge_src_core_clients_connector_link_connector_link --> bridge_src_core_clients_connector_link_core_session
  bridge_src_core_clients_connector_link_core_session --> bridge_src_utilities_clock_index
  bridge_src_core_clients_connector_link_core_session --> bridge_src_utilities_link_transport_index
  bridge_src_core_clients_connector_link_core_session --> bridge_src_utilities_logging_index
  bridge_src_core_clients_connector_link_core_session --> bridge_src_utilities_security_index
  bridge_src_core_clients_connector_link_core_session --> bridge_src_core_clients_connector_link_messages_index
  bridge_src_core_clients_connector_link_messages_home_messages --> bridge_src_utilities_link_transport_index
  bridge_src_core_clients_issuer_first_signing_key --> bridge_src_core_access_secrets_index
  bridge_src_core_clients_issuer_first_signing_key --> bridge_src_utilities_security_index
  bridge_src_core_clients_issuer_first_signing_key --> bridge_src_core_clients_issuer_signing_keys
  bridge_src_core_clients_issuer_grants_adapter --> bridge_src_core_access_grants_index
  bridge_src_core_clients_issuer_grants_adapter --> bridge_src_core_clients_issuer_listed_agents
  bridge_src_core_clients_issuer_issuer --> bridge_src_core_access_grants_index
  bridge_src_core_clients_issuer_issuer --> bridge_src_core_access_settings_index
  bridge_src_core_clients_issuer_issuer --> bridge_src_core_access_secrets_index
  bridge_src_core_clients_issuer_issuer --> bridge_src_utilities_clock_index
  bridge_src_core_clients_issuer_issuer --> bridge_src_utilities_logging_index
  bridge_src_core_clients_issuer_issuer --> bridge_src_utilities_security_index
  bridge_src_core_clients_issuer_issuer --> bridge_src_core_clients_issuer_grants_adapter
  bridge_src_core_clients_issuer_issuer --> bridge_src_core_clients_issuer_issuer_error
  bridge_src_core_clients_issuer_issuer --> bridge_src_core_clients_issuer_listed_agents
  bridge_src_core_clients_issuer_issuer --> bridge_src_core_clients_issuer_pending_sign_ins
  bridge_src_core_clients_issuer_issuer --> bridge_src_core_clients_issuer_provider_configuration
  bridge_src_core_clients_issuer_issuer --> bridge_src_core_clients_issuer_registration_limit
  bridge_src_core_clients_issuer_issuer --> bridge_src_core_clients_issuer_bounded_fetch
  bridge_src_core_clients_issuer_issuer --> bridge_src_core_clients_issuer_signing_keys
  bridge_src_core_clients_issuer_pending_sign_ins --> bridge_src_utilities_clock_index
  bridge_src_core_clients_issuer_pending_sign_ins --> bridge_src_utilities_security_index
  bridge_src_core_clients_issuer_provider_configuration --> bridge_src_core_clients_issuer_bounded_fetch
  bridge_src_core_clients_issuer_provider_configuration --> bridge_src_core_clients_issuer_listed_agents
  bridge_src_core_clients_issuer_provider_configuration --> bridge_src_core_clients_issuer_signing_keys
  bridge_src_core_clients_issuer_registration_limit --> bridge_src_utilities_clock_index
  bridge_src_core_clients_issuer_signing_keys --> bridge_src_core_clients_issuer_issuer_error
  bridge_src_core_clients_mcp_endpoint_mcp_endpoint --> bridge_src_utilities_clock_index
  bridge_src_core_clients_mcp_endpoint_mcp_endpoint --> bridge_src_utilities_logging_index
  bridge_src_core_clients_mcp_endpoint_mcp_endpoint --> bridge_src_core_clients_mcp_endpoint_read_limit
  bridge_src_core_clients_mcp_endpoint_mcp_endpoint --> bridge_src_core_clients_mcp_endpoint_read_tools
  bridge_src_core_clients_mcp_endpoint_read_limit --> bridge_src_utilities_clock_index
  bridge_src_core_clients_mcp_endpoint_read_tools --> bridge_src_contract_index
  bridge_src_core_clients_mcp_endpoint_read_tools --> bridge_src_utilities_clock_index
  bridge_src_core_clients_mcp_endpoint_read_tools --> bridge_src_utilities_logging_index
  bridge_src_core_clients_mcp_endpoint_read_tools --> bridge_src_core_managers_inquiry_index
  bridge_src_core_clients_mcp_endpoint_read_tools --> bridge_src_core_clients_mcp_endpoint_listed_input
  bridge_src_core_clients_mcp_endpoint_read_tools --> bridge_src_core_clients_mcp_endpoint_read_limit
  bridge_src_core_clients_web_admin_sign_ins --> bridge_src_utilities_clock_index
  bridge_src_core_clients_web_admin_sign_ins --> bridge_src_utilities_security_index
  bridge_src_core_clients_web_health_panel --> bridge_src_core_managers_inquiry_index
  bridge_src_core_clients_web_owner_sessions --> bridge_src_utilities_clock_index
  bridge_src_core_clients_web_pages --> bridge_src_core_managers_inquiry_index
  bridge_src_core_clients_web_pages --> bridge_src_core_clients_web_health_panel
  bridge_src_core_clients_web_pages --> bridge_src_core_clients_web_owner_sessions
  bridge_src_core_clients_web_pages --> bridge_src_core_clients_web_styles
  bridge_src_core_clients_web_web --> bridge_src_utilities_clock_index
  bridge_src_core_clients_web_web --> bridge_src_utilities_logging_index
  bridge_src_core_clients_web_web --> bridge_src_utilities_security_index
  bridge_src_core_clients_web_web --> bridge_src_core_managers_admin_index
  bridge_src_core_clients_web_web --> bridge_src_core_managers_inquiry_index
  bridge_src_core_clients_web_web --> bridge_src_core_clients_web_admin_sign_ins
  bridge_src_core_clients_web_web --> bridge_src_core_clients_web_health_panel
  bridge_src_core_clients_web_web --> bridge_src_core_clients_web_owner_sessions
  bridge_src_core_clients_web_web --> bridge_src_core_clients_web_page_script
  bridge_src_core_clients_web_web --> bridge_src_core_clients_web_styles
  bridge_src_core_engines_summary_summary_engine --> bridge_src_utilities_clock_index
  bridge_src_core_managers_admin_admin_manager --> bridge_src_core_access_settings_index
  bridge_src_core_managers_admin_admin_manager --> bridge_src_core_managers_admin_admin_error
  bridge_src_core_managers_event_event_manager --> bridge_src_utilities_clock_index
  bridge_src_core_managers_event_event_manager --> bridge_src_utilities_pub_sub_index
  bridge_src_core_managers_event_event_manager --> bridge_src_core_access_state_index
  bridge_src_core_managers_event_event_manager --> bridge_src_core_engines_health_index
  bridge_src_core_managers_event_event_manager --> bridge_src_core_managers_event_event_error
  bridge_src_core_managers_inquiry_inquiry_manager --> bridge_src_utilities_clock_index
  bridge_src_core_managers_inquiry_inquiry_manager --> bridge_src_core_access_settings_index
  bridge_src_core_managers_inquiry_inquiry_manager --> bridge_src_core_access_state_index
  bridge_src_core_managers_inquiry_inquiry_manager --> bridge_src_core_engines_health_index
  bridge_src_core_managers_inquiry_inquiry_manager --> bridge_src_core_managers_inquiry_inquiry_error
  bridge_src_host_all_in_one --> bridge_src_core_access_lease_index
  bridge_src_host_all_in_one --> bridge_src_core_access_settings_index
  bridge_src_host_all_in_one --> bridge_src_core_clients_mcp_endpoint_index
  bridge_src_host_all_in_one --> bridge_src_utilities_clock_index
  bridge_src_host_all_in_one --> bridge_src_utilities_config_index
  bridge_src_host_all_in_one --> bridge_src_utilities_link_transport_index
  bridge_src_host_all_in_one --> bridge_src_utilities_logging_index
  bridge_src_host_all_in_one --> bridge_src_utilities_security_index
  bridge_src_host_all_in_one --> bridge_src_host_core_assembly
  bridge_src_host_all_in_one --> bridge_src_host_home_assembly
  bridge_src_host_all_in_one --> bridge_src_host_home_files
  bridge_src_host_all_in_one --> bridge_src_host_host_error
  bridge_src_host_all_in_one --> bridge_src_host_leased_links
  bridge_src_host_connector_health --> bridge_src_utilities_clock_index
  bridge_src_host_connector_health --> bridge_src_utilities_logging_index
  bridge_src_host_connector --> bridge_src_utilities_clock_index
  bridge_src_host_connector --> bridge_src_utilities_config_index
  bridge_src_host_connector --> bridge_src_utilities_link_transport_index
  bridge_src_host_connector --> bridge_src_utilities_logging_index
  bridge_src_host_connector --> bridge_src_host_connector_health
  bridge_src_host_connector --> bridge_src_host_home_assembly
  bridge_src_host_connector --> bridge_src_host_home_files
  bridge_src_host_connector --> bridge_src_host_host_error
  bridge_src_host_connector --> bridge_src_host_ring_home_live
  bridge_src_host_core_assembly --> bridge_src_core_access_grants_index
  bridge_src_host_core_assembly --> bridge_src_core_access_lease_index
  bridge_src_host_core_assembly --> bridge_src_core_access_settings_index
  bridge_src_host_core_assembly --> bridge_src_core_access_state_index
  bridge_src_host_core_assembly --> bridge_src_core_managers_admin_index
  bridge_src_host_core_assembly --> bridge_src_core_managers_event_index
  bridge_src_host_core_assembly --> bridge_src_core_managers_inquiry_index
  bridge_src_host_core_assembly --> bridge_src_utilities_clock_index
  bridge_src_host_core_assembly --> bridge_src_utilities_config_index
  bridge_src_host_core_assembly --> bridge_src_utilities_logging_index
  bridge_src_host_core_assembly --> bridge_src_utilities_pub_sub_index
  bridge_src_host_core_assembly --> bridge_src_utilities_query_layer_index
  bridge_src_host_core_assembly --> bridge_src_host_leased_links
  bridge_src_host_core_service --> bridge_src_core_access_secrets_index
  bridge_src_host_core_service --> bridge_src_core_clients_issuer_index
  bridge_src_host_core_service --> bridge_src_core_clients_mcp_endpoint_index
  bridge_src_host_core_service --> bridge_src_utilities_clock_index
  bridge_src_host_core_service --> bridge_src_utilities_config_index
  bridge_src_host_core_service --> bridge_src_utilities_link_transport_index
  bridge_src_host_core_service --> bridge_src_utilities_logging_index
  bridge_src_host_core_service --> bridge_src_utilities_query_layer_index
  bridge_src_host_core_service --> bridge_src_utilities_security_index
  bridge_src_host_core_service --> bridge_src_host_core_assembly
  bridge_src_host_core_service --> bridge_src_host_version
  bridge_src_host_core --> bridge_src_core_access_secrets_index
  bridge_src_host_core --> bridge_src_core_access_secrets_key_vault_client_live
  bridge_src_host_core --> bridge_src_utilities_clock_index
  bridge_src_host_core --> bridge_src_utilities_config_index
  bridge_src_host_core --> bridge_src_utilities_logging_index
  bridge_src_host_core --> bridge_src_utilities_query_layer_tsql
  bridge_src_host_core --> bridge_src_utilities_query_layer_tsql_managed_identity_live
  bridge_src_host_core --> bridge_src_utilities_security_index
  bridge_src_host_core --> bridge_src_utilities_security_managed_identity_assertion_live
  bridge_src_host_core --> bridge_src_host_core_service
  bridge_src_host_first_signing_key --> bridge_src_core_access_secrets_index
  bridge_src_host_first_signing_key --> bridge_src_core_clients_issuer_index
  bridge_src_host_home_assembly --> bridge_src_connector_access_outbox_store_index
  bridge_src_host_home_assembly --> bridge_src_connector_access_ring_adapter_index
  bridge_src_host_home_assembly --> bridge_src_connector_clients_core_link_index
  bridge_src_host_home_assembly --> bridge_src_connector_clients_home_scheduler_index
  bridge_src_host_home_assembly --> bridge_src_connector_managers_ingest_index
  bridge_src_host_home_assembly --> bridge_src_utilities_clock_index
  bridge_src_host_home_assembly --> bridge_src_utilities_link_transport_index
  bridge_src_host_home_assembly --> bridge_src_utilities_logging_index
  bridge_src_host_home_assembly --> bridge_src_utilities_security_index
  bridge_src_host_home_files --> bridge_src_utilities_clock_index
  bridge_src_host_home_files --> bridge_src_host_host_error
  bridge_src_host_leased_links --> bridge_src_core_access_lease_index
  bridge_src_host_leased_links --> bridge_src_core_clients_connector_link_index
  bridge_src_host_leased_links --> bridge_src_core_managers_event_index
  bridge_src_host_leased_links --> bridge_src_utilities_clock_index
  bridge_src_host_leased_links --> bridge_src_utilities_link_transport_index
  bridge_src_host_leased_links --> bridge_src_utilities_logging_index
  bridge_src_host_main --> bridge_src_utilities_clock_index
  bridge_src_host_main --> bridge_src_utilities_config_index
  bridge_src_host_main --> bridge_src_utilities_logging_index
  bridge_src_host_main --> bridge_src_host_version
  bridge_src_host_ring_home_live --> bridge_src_connector_access_ring_adapter_ring_api_adapter
  bridge_src_host_ring_home_live --> bridge_src_connector_access_ring_adapter_ring_client_live
  bridge_src_host_ring_home_live --> bridge_src_utilities_clock_index
  bridge_src_host_ring_home_live --> bridge_src_utilities_logging_index
  bridge_src_host_ring_home_live --> bridge_src_host_home_assembly
  bridge_src_host_ring_home_live --> bridge_src_host_home_files
  bridge_src_host_setup --> bridge_src_connector_access_ring_adapter_ring_login_live
  bridge_src_host_setup --> bridge_src_utilities_clock_index
  bridge_src_host_setup --> bridge_src_utilities_config_index
  bridge_src_utilities_clock_fake_clock --> bridge_src_utilities_clock_clock
  bridge_src_utilities_clock_fake_clock --> bridge_src_utilities_clock_clock_error
  bridge_src_utilities_clock_time_format --> bridge_src_utilities_clock_clock_error
  bridge_src_utilities_config_settings --> bridge_src_utilities_config_config_error
  bridge_src_utilities_config_settings --> bridge_src_utilities_config_section
  bridge_src_utilities_link_transport_dial_link --> bridge_src_utilities_link_transport_link_frame
  bridge_src_utilities_link_transport_dial_link --> bridge_src_utilities_link_transport_link_connection
  bridge_src_utilities_link_transport_dial_link --> bridge_src_utilities_link_transport_socket_link
  bridge_src_utilities_link_transport_link_connection --> bridge_src_utilities_logging_index
  bridge_src_utilities_link_transport_link_connection --> bridge_src_utilities_link_transport_link_frame
  bridge_src_utilities_link_transport_link_connection --> bridge_src_utilities_link_transport_send_queue
  bridge_src_utilities_link_transport_link_pair --> bridge_src_utilities_logging_index
  bridge_src_utilities_link_transport_link_pair --> bridge_src_utilities_link_transport_link_connection
  bridge_src_utilities_link_transport_link_server --> bridge_src_utilities_link_transport_link_frame
  bridge_src_utilities_link_transport_link_server --> bridge_src_utilities_link_transport_link_connection
  bridge_src_utilities_link_transport_link_server --> bridge_src_utilities_link_transport_socket_link
  bridge_src_utilities_link_transport_link_slot --> bridge_src_utilities_link_transport_link_connection
  bridge_src_utilities_link_transport_send_queue --> bridge_src_utilities_link_transport_link_frame
  bridge_src_utilities_link_transport_socket_link --> bridge_src_utilities_clock_index
  bridge_src_utilities_link_transport_socket_link --> bridge_src_utilities_logging_index
  bridge_src_utilities_link_transport_socket_link --> bridge_src_utilities_link_transport_link_connection
  bridge_src_utilities_link_transport_socket_link --> bridge_src_utilities_link_transport_link_frame
  bridge_src_utilities_logging_format_line --> bridge_src_utilities_logging_log_fields
  bridge_src_utilities_logging_format_line --> bridge_src_utilities_logging_redaction
  bridge_src_utilities_logging_format_line --> bridge_src_utilities_logging_serialize_error
  bridge_src_utilities_logging_logger --> bridge_src_utilities_logging_format_line
  bridge_src_utilities_logging_logger --> bridge_src_utilities_logging_log_fields
  bridge_src_utilities_logging_stdout_sink --> bridge_src_utilities_logging_logger
  bridge_src_utilities_query_layer_migrations_0001_iteration_001_schema --> bridge_src_utilities_query_layer_migrations_migration
  bridge_src_utilities_query_layer_migrations_0002_connector_enrollment_code --> bridge_src_utilities_query_layer_migrations_migration
  bridge_src_utilities_query_layer_migrations_0003_one_pending_enrollment --> bridge_src_utilities_query_layer_migrations_migration
  bridge_src_utilities_query_layer_migrations_0004_state_source --> bridge_src_utilities_query_layer_migrations_migration
  bridge_src_utilities_query_layer_migrations_0005_snapshot_order --> bridge_src_utilities_query_layer_migrations_migration
  bridge_src_utilities_query_layer_migrations_0006_motion_since --> bridge_src_utilities_query_layer_migrations_migration
  bridge_src_utilities_query_layer_migrations_core_migrations --> bridge_src_utilities_query_layer_migrations_0001_iteration_001_schema
  bridge_src_utilities_query_layer_migrations_core_migrations --> bridge_src_utilities_query_layer_migrations_0002_connector_enrollment_code
  bridge_src_utilities_query_layer_migrations_core_migrations --> bridge_src_utilities_query_layer_migrations_0003_one_pending_enrollment
  bridge_src_utilities_query_layer_migrations_core_migrations --> bridge_src_utilities_query_layer_migrations_0004_state_source
  bridge_src_utilities_query_layer_migrations_core_migrations --> bridge_src_utilities_query_layer_migrations_0005_snapshot_order
  bridge_src_utilities_query_layer_migrations_core_migrations --> bridge_src_utilities_query_layer_migrations_0006_motion_since
  bridge_src_utilities_query_layer_migrations_core_migrations --> bridge_src_utilities_query_layer_migrations_migration
  bridge_src_utilities_query_layer_migrations_migration --> bridge_src_utilities_query_layer_query_layer_error
  bridge_src_utilities_query_layer_migrations_migration --> bridge_src_utilities_query_layer_sql_types
  bridge_src_utilities_query_layer_migrations_run_migrations --> bridge_src_utilities_clock_index
  bridge_src_utilities_query_layer_migrations_run_migrations --> bridge_src_utilities_query_layer_query_layer_error
  bridge_src_utilities_query_layer_migrations_run_migrations --> bridge_src_utilities_query_layer_query_layer
  bridge_src_utilities_query_layer_migrations_run_migrations --> bridge_src_utilities_query_layer_sql_types
  bridge_src_utilities_query_layer_migrations_run_migrations --> bridge_src_utilities_query_layer_migrations_migration
  bridge_src_utilities_query_layer_parameters --> bridge_src_utilities_query_layer_query_layer_error
  bridge_src_utilities_query_layer_parameters --> bridge_src_utilities_query_layer_sql_types
  bridge_src_utilities_query_layer_query_layer --> bridge_src_utilities_clock_index
  bridge_src_utilities_query_layer_query_layer --> bridge_src_utilities_query_layer_parameters
  bridge_src_utilities_query_layer_query_layer --> bridge_src_utilities_query_layer_query_layer_error
  bridge_src_utilities_query_layer_query_layer --> bridge_src_utilities_query_layer_serial_queue
  bridge_src_utilities_query_layer_query_layer --> bridge_src_utilities_query_layer_sql_driver
  bridge_src_utilities_query_layer_serial_queue --> bridge_src_utilities_query_layer_until_aborted
  bridge_src_utilities_query_layer_sql_driver --> bridge_src_utilities_query_layer_query_layer_error
  bridge_src_utilities_query_layer_sql_driver --> bridge_src_utilities_query_layer_sql_types
  bridge_src_utilities_query_layer_sqlite --> bridge_src_utilities_query_layer_query_layer
  bridge_src_utilities_query_layer_sqlite --> bridge_src_utilities_query_layer_query_layer_error
  bridge_src_utilities_query_layer_sqlite --> bridge_src_utilities_query_layer_sql_types
  bridge_src_utilities_query_layer_statements --> bridge_src_utilities_query_layer_query_layer_error
  bridge_src_utilities_query_layer_statements --> bridge_src_utilities_query_layer_sql_types
  bridge_src_utilities_query_layer_tsql --> bridge_src_utilities_query_layer_query_layer
  bridge_src_utilities_query_layer_tsql --> bridge_src_utilities_query_layer_query_layer_error
  bridge_src_utilities_query_layer_tsql --> bridge_src_utilities_query_layer_sql_types
  bridge_src_utilities_query_layer_tsql --> bridge_src_utilities_query_layer_until_aborted
  bridge_src_utilities_security_entra_discovery --> bridge_src_utilities_security_security_error
  bridge_src_utilities_security_entra_sign_in --> bridge_src_utilities_clock_index
  bridge_src_utilities_security_entra_sign_in --> bridge_src_utilities_security_entra_discovery
  bridge_src_utilities_security_entra_sign_in --> bridge_src_utilities_security_security_error
  bridge_src_utilities_security_managed_identity_assertion_live --> bridge_src_utilities_security_entra_sign_in
  bridge_src_utilities_security_sealing --> bridge_src_utilities_security_security_error
  bridge_src_utilities_security_signing --> bridge_src_utilities_security_security_error
```

## Flow Diagram

```mermaid
flowchart TD
  bridge_src_connector_access_outbox_store_index["bridge/src/connector/access/outbox-store/index"]
  bridge_src_connector_access_ring_adapter_index["bridge/src/connector/access/ring-adapter/index"]
  bridge_src_connector_access_ring_adapter_ring_api_adapter["bridge/src/connector/access/ring-adapter/ring-api-adapter"]
  bridge_src_connector_access_ring_adapter_ring_api_adapter --> bridge_src_utilities_clock_index
  bridge_src_connector_access_ring_adapter_ring_api_adapter --> bridge_src_utilities_logging_index
  bridge_src_connector_access_ring_adapter_ring_api_adapter --> bridge_src_utilities_security_index
  bridge_src_connector_access_ring_adapter_ring_api_adapter --> bridge_src_connector_access_ring_adapter_alarm_devices
  bridge_src_connector_access_ring_adapter_ring_api_adapter --> bridge_src_connector_access_ring_adapter_hub_sessions
  bridge_src_connector_access_ring_adapter_ring_api_adapter --> bridge_src_connector_access_ring_adapter_call_limits
  bridge_src_connector_access_ring_adapter_ring_api_adapter --> bridge_src_connector_access_ring_adapter_ring_adapter_error
  bridge_src_connector_access_ring_adapter_ring_api_adapter --> bridge_src_connector_access_ring_adapter_ring_failure
  bridge_src_connector_access_ring_adapter_ring_api_adapter --> bridge_src_connector_access_ring_adapter_room_lists
  bridge_src_connector_access_ring_adapter_ring_client_live["bridge/src/connector/access/ring-adapter/ring-client.live"]
  bridge_src_connector_access_ring_adapter_ring_client_live --> bridge_src_connector_access_ring_adapter_ring_client
  bridge_src_connector_access_ring_adapter_ring_client_live --> bridge_src_connector_access_ring_adapter_ring_library_live
  bridge_src_connector_access_ring_adapter_ring_client["bridge/src/connector/access/ring-adapter/ring-client"]
  bridge_src_connector_access_ring_adapter_ring_mapping["bridge/src/connector/access/ring-adapter/ring-mapping"]
  bridge_src_connector_access_ring_adapter_ring_mapping --> bridge_src_utilities_clock_index
  bridge_src_connector_access_secrets_file_index["bridge/src/connector/access/secrets-file/index"]
  bridge_src_connector_clients_core_link_index["bridge/src/connector/clients/core-link/index"]
  bridge_src_connector_clients_core_link_messages_index["bridge/src/connector/clients/core-link/messages/index"]
  bridge_src_connector_clients_home_scheduler_index["bridge/src/connector/clients/home-scheduler/index"]
  bridge_src_connector_clients_setup_cli_index["bridge/src/connector/clients/setup-cli/index"]
  bridge_src_connector_managers_ingest_index["bridge/src/connector/managers/ingest/index"]
  bridge_src_contract_index["bridge/src/contract/index"]
  bridge_src_core_access_grants_index["bridge/src/core/access/grants/index"]
  bridge_src_core_access_lease_index["bridge/src/core/access/lease/index"]
  bridge_src_core_access_secrets_index["bridge/src/core/access/secrets/index"]
  bridge_src_core_access_secrets_key_vault_client_live["bridge/src/core/access/secrets/key-vault-client.live"]
  bridge_src_core_access_secrets_key_vault_client_live --> bridge_src_core_access_secrets_key_vault_secrets
  bridge_src_core_access_settings_index["bridge/src/core/access/settings/index"]
  bridge_src_core_access_state_index["bridge/src/core/access/state/index"]
  bridge_src_core_clients_connector_link_index["bridge/src/core/clients/connector-link/index"]
  bridge_src_core_clients_connector_link_intake_mapping["bridge/src/core/clients/connector-link/intake-mapping"]
  bridge_src_core_clients_connector_link_messages_index["bridge/src/core/clients/connector-link/messages/index"]
  bridge_src_core_clients_issuer_index["bridge/src/core/clients/issuer/index"]
  bridge_src_core_clients_mcp_endpoint_index["bridge/src/core/clients/mcp-endpoint/index"]
  bridge_src_core_clients_web_index["bridge/src/core/clients/web/index"]
  bridge_src_core_engines_health_index["bridge/src/core/engines/health/index"]
  bridge_src_core_engines_summary_index["bridge/src/core/engines/summary/index"]
  bridge_src_core_managers_admin_index["bridge/src/core/managers/admin/index"]
  bridge_src_core_managers_event_index["bridge/src/core/managers/event/index"]
  bridge_src_core_managers_inquiry_index["bridge/src/core/managers/inquiry/index"]
  bridge_src_host_main["bridge/src/host/main"]
  bridge_src_host_main --> bridge_src_utilities_clock_index
  bridge_src_host_main --> bridge_src_utilities_config_index
  bridge_src_host_main --> bridge_src_utilities_logging_index
  bridge_src_host_main --> bridge_src_host_version
  bridge_src_utilities_clock_index["bridge/src/utilities/clock/index"]
  bridge_src_utilities_config_index["bridge/src/utilities/config/index"]
  bridge_src_utilities_link_transport_index["bridge/src/utilities/link-transport/index"]
  bridge_src_utilities_logging_index["bridge/src/utilities/logging/index"]
  bridge_src_utilities_pub_sub_index["bridge/src/utilities/pub-sub/index"]
  bridge_src_utilities_query_layer_index["bridge/src/utilities/query-layer/index"]
  bridge_src_utilities_security_index["bridge/src/utilities/security/index"]
```

## Omissions

- none

## Local View Hints

- specs\001-ring-mcp-bridge\iterations\001\review-diagrams.md
