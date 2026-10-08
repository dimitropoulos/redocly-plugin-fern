import type { RuleDefinition } from "../utils/types.js";
import { contentTypeOnlyForMultipart } from "./content-type-only-for-multipart.js";
import { explodedFormDataIsArray } from "./exploded-form-data-is-array.js";
import { matchingEnvironmentUrls } from "./matching-environment-urls.js";
import { noComplexQueryParams } from "./no-complex-query-params.js";
import { noComponentSchemaCollisions } from "./no-component-schema-collisions.js";
import { noConflictingEndpointParameters } from "./no-conflicting-endpoint-parameters.js";
import { noConflictingEndpointPaths } from "./no-conflicting-endpoint-paths.js";
import { noConflictingParameterNames } from "./no-conflicting-parameter-names.js";
import { noConflictingRequestWrapperProperties } from "./no-conflicting-request-wrapper-properties.js";
import { noDuplicateAuthHeaderParameters } from "./no-duplicate-auth-header-parameters.js";
import { noDuplicateDeclarations } from "./no-duplicate-declarations.js";
import { noDuplicateExampleNames } from "./no-duplicate-example-names.js";
import { noDuplicateFieldNames } from "./no-duplicate-field-names.js";
import { noDuplicateOverrides } from "./no-duplicate-overrides.js";
import { noExtensionsWithFileUpload } from "./no-extensions-with-file-upload.js";
import { noGetRequestBody } from "./no-get-request-body.js";
import { noInvalidTagNamesOrFrontmatter } from "./no-invalid-tag-names-or-frontmatter.js";
import { noMissingAuth } from "./no-missing-auth.js";
import { noNonComponentRefs } from "./no-non-component-refs.js";
import { noOpenApiV2InDocs } from "./no-openapi-v2-in-docs.js";
import { noResponseProperty } from "./no-response-property.js";
import { noSchemaTitleCollisions } from "./no-schema-title-collisions.js";
import { noUndefinedExampleReference } from "./no-undefined-example-reference.js";
import { noUndefinedPathParameters } from "./no-undefined-path-parameters.js";
import { noUndefinedTypeReference } from "./no-undefined-type-reference.js";
import { noUndefinedVariableReference } from "./no-undefined-variable-reference.js";
import { onlyObjectExtensions } from "./only-object-extensions.js";
import { validBasePath } from "./valid-base-path.js";
import { validBaseUrlEnv } from "./valid-base-url-env.js";
import { validExampleEndpointCall } from "./valid-example-endpoint-call.js";
import { validFieldNames } from "./valid-field-names.js";
import { validGlobalParameters } from "./valid-global-parameters.js";
import { validOauth } from "./valid-oauth.js";
import { validPagination } from "./valid-pagination.js";
import { validServiceUrls } from "./valid-service-urls.js";
import { validStreamCondition } from "./valid-stream-condition.js";
import { validTypeName } from "./valid-type-name.js";
import { validTypeReferenceWithDefaultAndValidation } from "./valid-type-reference-with-default-and-validation.js";
import { validVersion } from "./valid-version.js";
import { validWebhookSignature } from "./valid-webhook-signature.js";

export const ruleDefinitions: RuleDefinition[] = [
  contentTypeOnlyForMultipart,
  explodedFormDataIsArray,
  matchingEnvironmentUrls,
  noComplexQueryParams,
  noComponentSchemaCollisions,
  noConflictingEndpointParameters,
  noConflictingEndpointPaths,
  noConflictingParameterNames,
  noConflictingRequestWrapperProperties,
  noDuplicateAuthHeaderParameters,
  noDuplicateDeclarations,
  noDuplicateExampleNames,
  noDuplicateFieldNames,
  noDuplicateOverrides,
  noExtensionsWithFileUpload,
  noGetRequestBody,
  noInvalidTagNamesOrFrontmatter,
  noMissingAuth,
  noNonComponentRefs,
  noOpenApiV2InDocs,
  noResponseProperty,
  noSchemaTitleCollisions,
  noUndefinedExampleReference,
  noUndefinedPathParameters,
  noUndefinedTypeReference,
  noUndefinedVariableReference,
  onlyObjectExtensions,
  validBasePath,
  validBaseUrlEnv,
  validExampleEndpointCall,
  validFieldNames,
  validGlobalParameters,
  validOauth,
  validPagination,
  validServiceUrls,
  validStreamCondition,
  validTypeName,
  validTypeReferenceWithDefaultAndValidation,
  validVersion,
  validWebhookSignature,
].sort((left, right) => left.name.localeCompare(right.name));
