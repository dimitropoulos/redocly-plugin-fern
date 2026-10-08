# redocly-plugin-fern

A [Redocly CLI](https://redocly.com/docs/cli/) plugin that brings [Fern](https://buildwithfern.com)'s
API definition validation to OpenAPI linting.

Fern imports OpenAPI documents (plus its `x-fern-*` extensions), converts them to a Fern
definition, and validates that definition. Errors show up late, in `fern check`, and talk about the
generated definition rather than the OpenAPI you wrote. Some problems never show up at all: the
importer silently drops or rewrites configuration it can't use.

This plugin runs those checks directly on the OpenAPI document, with messages that point at the
OpenAPI field to fix. It covers:

- Fern's definition validator rules, wherever they have an OpenAPI counterpart
- Fern's OpenAPI workspace rules
- the docs rules that inspect OpenAPI files

It skips anything a built-in Redocly rule already does. Instead, `fern/recommended` turns on the
built-in rule.

## Usage

The plugin isn't published to npm. Install the built package from a GitHub release:

```sh
pnpm add --save-dev @redocly/cli \
  https://github.com/dimitropoulos/redocly-plugin-fern/releases/download/v0.1.0/redocly-plugin-fern-0.1.0.tgz
```

```yaml
# redocly.yaml
plugins:
  - ./node_modules/redocly-plugin-fern/dist/index.js

extends:
  - fern/recommended
```

```sh
pnpm redocly lint openapi.yaml
```

`fern/recommended` enables every rule in this plugin, plus the built-in Redocly rules listed under
[Covered by built-in Redocly rules](#covered-by-built-in-redocly-rules). You can also turn on single
rules, e.g. `fern/valid-pagination: error`.

The rules lint OpenAPI 3.0 and 3.1. Fern converts Swagger 2.0 documents to OpenAPI 3 before
validating them, so the only rule that runs on Swagger 2.0 is `fern/no-openapi-v2-in-docs`.

### Settings that live in generators.yml

Some Fern behavior depends on `generators.yml`, which Redocly can't see. Those rules take the
setting as an option:

| Rule                                  | Option                                                                                                   | Mirrors                                                                          |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `fern/valid-oauth`                    | `getToken`, `refreshToken` (see below)                                                                   | `auth-schemes` client-credentials config. Without options the rule does nothing. |
| `fern/no-component-schema-collisions` | `apis: string[]` (other specs of the same Fern API, relative to redocly.yaml), `resolveSchemaCollisions` | `api.specs`, `resolve-schema-collisions`                                         |
| `fern/no-schema-title-collisions`     | `resolveSchemaCollisions`                                                                                | Enabling the rule means `title-as-schema-name: true`                             |
| `fern/no-duplicate-declarations`      | `resolveSchemaCollisions`                                                                                | `resolve-schema-collisions`                                                      |
| `fern/no-duplicate-overrides`         | `namespace`                                                                                              | The spec's `namespace`, used in messages                                         |
| `fern/only-object-extensions`         | `inlineAllOfSchemas`                                                                                     | `inline-all-of-schemas`                                                          |
| `fern/exploded-form-data-is-array`    | `defaultFormParameterEncoding: form \| json`                                                             | `default-form-parameter-encoding`                                                |

```yaml
rules:
  fern/valid-oauth:
    severity: error
    getToken:
      endpoint: POST /token
      requestProperties:
        { clientId: $request.client_id, clientSecret: $request.client_secret }
      responseProperties:
        { accessToken: $response.access_token, expiresIn: $response.expires_in }
    refreshToken:
      endpoint: POST /token/refresh
      requestProperties: { refreshToken: $request.refresh_token }
```

## Rules

Fern rule ids are `<validator>/<rule>`:

- `fern-definition`: Fern's definition validator
- `oss`: the OpenAPI workspace validator
- `docs`: the docs validator

Each plugin rule has the same name as the Fern rule it ports.

| Rule                                                    | Severity | Ports                                                                    | Checks                                                                                                                                                                                                         |
| ------------------------------------------------------- | -------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fern/content-type-only-for-multipart`                  | error    | fern-definition/content-type-only-for-multipart                          | Per-property `encoding.contentType` is only honored on multipart request bodies.                                                                                                                               |
| `fern/exploded-form-data-is-array`                      | error    | fern-definition/exploded-form-data-is-array                              | Multipart properties with `encoding.<prop>.explode: true` must be arrays.                                                                                                                                      |
| `fern/matching-environment-urls`                        | error    | fern-definition/matching-environment-urls                                | Every server URL makes it into the environments Fern builds from `servers` and `x-fern-server-name`. Catches duplicate names, partially named lists and the reserved `Base` name.                              |
| `fern/no-complex-query-params`                          | error    | fern-definition/no-complex-query-params                                  | Query parameters can't use schemas that are, or contain, a discriminated union (as Fern's importer defines one).                                                                                               |
| `fern/no-component-schema-collisions`                   | warn     | oss/no-component-schema-collisions                                       | A `components.schemas` key must not be defined in more than one spec of a Fern API.                                                                                                                            |
| `fern/no-conflicting-endpoint-parameters`               | error    | fern-definition/no-conflicting-endpoint-parameters                       | Path parameters can't be named `request`.                                                                                                                                                                      |
| `fern/no-conflicting-endpoint-paths`                    | warn     | fern-definition/no-conflicting-endpoint-paths                            | Operations with the same method must not have paths that match the same URLs, e.g. `GET /users/me` and `GET /users/{id}`.                                                                                      |
| `fern/no-conflicting-parameter-names`                   | error    | oss/no-conflicting-parameter-names                                       | Parameters in different locations must not normalize to the same camelCase name.                                                                                                                               |
| `fern/no-conflicting-request-wrapper-properties`        | error    | fern-definition/no-conflicting-request-wrapper-properties                | Parameters and body properties need distinct names in the generated request object. Follows Fern's renaming, inlining and header naming.                                                                       |
| `fern/no-duplicate-auth-header-parameters`              | warn     | oss/no-duplicate-auth-header-parameters                                  | Header parameters must not redeclare a header a security scheme defines.                                                                                                                                       |
| `fern/no-duplicate-declarations`                        | error    | fern-definition/no-duplicate-declarations                                | Type, request and error names Fern generates must be unique. Covers names that fail `fern check` and types Fern silently overwrites.                                                                           |
| `fern/no-duplicate-example-names`                       | error    | fern-definition/no-duplicate-example-names                               | `x-fern-examples` names must be unique per operation.                                                                                                                                                          |
| `fern/no-duplicate-field-names`                         | error    | fern-definition/no-duplicate-field-names                                 | Property names (including `x-fern-property-name` and inherited properties) and enum names (including `x-fern-enum` and `x-enum-varnames`) must be unique. Fern silently drops enum values whose names collide. |
| `fern/no-extensions-with-file-upload`                   | error    | fern-definition/no-extensions-with-file-upload                           | Multipart body schemas can't inherit properties through `allOf` `$ref`s; Fern drops them.                                                                                                                      |
| `fern/no-get-request-body`                              | error    | fern-definition/no-get-request-body                                      | GET and HEAD operations can't have a request body.                                                                                                                                                             |
| `fern/no-invalid-tag-names-or-frontmatter`              | error    | oss/no-invalid-tag-names-or-frontmatter                                  | Tag names must be ASCII, and operation descriptions must not contain `---` frontmatter delimiters.                                                                                                             |
| `fern/no-missing-auth`                                  | error    | fern-definition/no-missing-auth                                          | Operations that require auth need at least one security scheme Fern supports.                                                                                                                                  |
| `fern/no-non-component-refs`                            | error    | docs/no-non-component-refs                                               | Local `$ref`s must point under `#/components/`.                                                                                                                                                                |
| `fern/no-openapi-v2-in-docs`                            | warn     | docs/no-openapi-v2-in-docs                                               | Swagger 2.0 documents should be upgraded. Runs on Swagger 2.0 only.                                                                                                                                            |
| `fern/no-response-property`                             | error    | fern-definition/no-response-property                                     | `x-fern-sdk-return-value` must name a top-level property of an object JSON response, on an operation where Fern applies it.                                                                                    |
| `fern/no-schema-title-collisions`                       | error    | oss/no-schema-title-collisions                                           | Component schemas must not share a `title` when Fern names schemas after titles.                                                                                                                               |
| `fern/no-undefined-example-reference`                   | error    | fern-definition/no-undefined-example-reference                           | `x-fern-examples` values must not look like Fern example references (`$Type.Example`).                                                                                                                         |
| `fern/no-undefined-path-parameters`                     | error    | fern-definition/no-undefined-path-parameters                             | A path template or `x-fern-base-path` must not repeat a parameter, and every base path parameter must be used.                                                                                                 |
| `fern/no-undefined-type-reference`                      | error    | fern-definition/no-undefined-type-reference                              | Fern type syntax in `x-fern-type`, `x-fern-global-headers` and `x-fern-idempotency-headers` must parse, and must reference existing schemas.                                                                   |
| `fern/no-undefined-variable-reference`                  | error    | fern-definition/no-undefined-variable-reference                          | `x-fern-sdk-variable` must reference a string variable declared in `x-fern-sdk-variables`, and must be on a path parameter.                                                                                    |
| `fern/only-object-extensions`                           | error    | fern-definition/only-object-extensions                                   | Schemas Fern turns into `extends` (`allOf` `$ref` members) must be objects.                                                                                                                                    |
| `fern/valid-base-path`                                  | error    | fern-definition/valid-base-path                                          | `x-fern-base-path` is well formed and starts with a slash. With `paths-include-base-path`, it must prefix every path.                                                                                          |
| `fern/valid-base-url-env`                               | error    | fern-definition/valid-base-url-env                                       | `x-fern-base-url-env` is a non-empty string, and there are servers for it to override.                                                                                                                         |
| `fern/valid-example-endpoint-call`                      | error    | fern-definition/valid-example-endpoint-call, docs/valid-openapi-examples | Each `x-fern-examples` entry must match Fern's example format and the operation's parameters, global and auth headers, request body, responses, errors and streams.                                            |
| `fern/valid-field-names`                                | error    | fern-definition/valid-field-names                                        | Enum names and discriminant names must start with a letter and contain only letters, numbers and underscores.                                                                                                  |
| `fern/valid-global-parameters`                          | error    | fern-definition/valid-global-parameters                                  | `x-fern-global-parameters` entries are well formed, and `x-fern-global-parameter` only references declared parameters.                                                                                         |
| `fern/valid-oauth`                                      | error    | fern-definition/valid-oauth                                              | The client-credentials token and refresh endpoints in the options exist and expose the configured properties with the right types.                                                                             |
| `fern/valid-pagination`                                 | error    | fern-definition/valid-pagination                                         | `x-fern-pagination` (operation and document level) is well formed, and its selectors point to request and response properties of the right type.                                                               |
| `fern/valid-service-urls`                               | error    | fern-definition/valid-service-urls                                       | Operation and path-level servers are named with `x-fern-server-name`, and every `x-fern-server-name` names a base URL.                                                                                         |
| `fern/valid-stream-condition`                           | error    | fern-definition/valid-stream-condition                                   | `x-fern-streaming` is well formed, and its `stream-condition` names a boolean property of the JSON request body.                                                                                               |
| `fern/valid-type-name`                                  | error    | fern-definition/valid-type-name                                          | Type names Fern declares, whether from `x-fern-type-name` or generated from schema keys, must begin with a letter.                                                                                             |
| `fern/valid-type-reference-with-default-and-validation` | error    | fern-definition/valid-type-reference-with-default-and-validation         | `default` matches the schema's type and enum, and integer `minimum`/`maximum`/`multipleOf` are integers.                                                                                                       |
| `fern/valid-version`                                    | error    | fern-definition/valid-version                                            | `x-fern-version` has a header and a list of unique values, and its default is one of them.                                                                                                                     |
| `fern/valid-webhook-signature`                          | error    | fern-definition/valid-webhook-signature                                  | `x-fern-webhook-signature` is a valid HMAC or asymmetric config, and is only set on webhooks.                                                                                                                  |

Some reports are warnings regardless of the rule's severity. These cover cases where Fern quietly
falls back to a working default: an invalid enum name override, `x-fern-pagination: false`, and
similar.

### Covered by built-in Redocly rules

These Fern rules, or parts of them, are already implemented by Redocly, so the plugin doesn't
duplicate them. `fern/recommended` enables the built-in rule instead. Fixtures under
`test/covered-by-redocly/` show the built-in rule catching each case.

| Fern rule                                                                   | Built-in Redocly rule            |
| --------------------------------------------------------------------------- | -------------------------------- |
| fern-definition/import-file-exists                                          | `no-unresolved-refs`             |
| fern-definition/no-undefined-type-reference (broken `$ref`s)                | `no-unresolved-refs`             |
| docs/valid-local-references                                                 | `no-unresolved-refs`             |
| fern-definition/no-undefined-path-parameters (missing or unused parameters) | `path-params-defined`            |
| fern-definition/no-duplicate-enum-values                                    | `no-duplicated-enum-values`      |
| fern-definition/valid-endpoint-path                                         | `struct`                         |
| fern-definition/valid-example-error                                         | `no-invalid-media-type-examples` |
| docs/valid-openapi-examples (native examples)                               | `no-invalid-media-type-examples` |
| fern-definition/valid-example-type                                          | `no-invalid-schema-examples`     |
| fern-definition/no-duplicate-declarations (duplicate operationIds)          | `operation-operationId-unique`   |

`security-defined` reports undefined security scheme names. It pairs well with `fern/no-missing-auth`,
but `fern/recommended` leaves it off, because it also requires every operation to declare security,
which Fern doesn't.

### Not ported

These Fern rules check things that have no OpenAPI counterpart. In some cases Fern's importer
always produces valid output, so the problem can't arise from an OpenAPI document.

| Fern rule                                                                      | Why                                                                                    |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| fern-definition/no-circular-imports                                            | Fern YAML imports. It's also disabled in Fern, and circular `$ref`s are legal OpenAPI. |
| fern-definition/no-unused-generic, fern-definition/valid-generic               | Generics only exist in Fern YAML.                                                      |
| fern-definition/valid-navigation                                               | Orders files in a Fern definition directory.                                           |
| fern-definition/no-object-single-property-key                                  | Fern union `key`. OpenAPI unions have no equivalent.                                   |
| fern-definition/no-undefined-error-reference                                   | Fern generates errors from response status codes, so nothing references them by name.  |
| fern-definition/no-error-status-code-conflict                                  | Errors are keyed by status code, so two can't share one.                               |
| fern-definition/no-missing-error-discriminant                                  | The importer always sets the error discrimination.                                     |
| fern-definition/no-missing-request-name                                        | The importer always names request wrappers.                                            |
| fern-definition/valid-default-environment                                      | The default environment is configured in generators.yml.                               |
| fern-definition/valid-path-parameters-configuration                            | The importer puts path parameters in exactly one place.                                |
| oauth authorization-code and device-code checks in fern-definition/valid-oauth | They configure Fern's generated CLI, not the API.                                      |
| docs validator rules other than the ones above                                 | They validate docs.yml and Markdown content.                                           |
| generators validator rules                                                     | They validate generators.yml.                                                          |

## Development

```sh
pnpm install
pnpm check        # typecheck, oxlint, oxfmt --check, tests
pnpm test:update  # regenerate fixture outputs (review the diff!)
```

Every rule is tested with input/output fixtures:

```
test/fixtures/<rule>/<case>/openapi.yaml   # input (can $ref other files in the case directory)
test/fixtures/<rule>/<case>/redocly.yaml   # optional: rule options/severity
test/fixtures/<rule>/<case>/output.json    # expected problems
```

By default a case runs with only `fern/<rule>` enabled, at `error`. The suite requires every rule to
have at least one case without problems and one case that reports the rule. To regenerate one rule:

```sh
UPDATE_FIXTURES=1 pnpm vitest run -t "<rule>"
```

### Comparing with `fern check`

With the `fern` CLI installed, `pnpm compare-with-fern [filter]` runs the real `fern check` on every
fixture. It prints the plugin's output next to Fern's. The fixtures were validated this way against
Fern 5.149.0.

Where the two disagree, it's deliberate. The plugin also reports things Fern accepts but silently
drops, rewrites or crashes on, and each of those cases was confirmed against the definition Fern
generates (`fern write-definition`).

The comparison runs `fern check` with default generators.yml settings, so cases that use rule
options will differ. A few Fern warnings are out of scope:

- Fern warns that every operation with an `x-fern-streaming` `stream-condition` conflicts with
  itself, because it splits that operation into two endpoints on the same path. You can't fix that
  in the document, so `fern/no-conflicting-endpoint-paths` doesn't report it.
- Fern reports some problems under a different rule than the fixture's rule. Those are covered by
  the matching plugin rule, which is the one that reports them under `fern/recommended`.
