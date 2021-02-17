import Ressource from "./Ressource";
import Account from "./Account";
import User from "./User";
import { getConfig } from "../config";

const paramDefaults = {};

const ROLE_ADMIN = "admin";
const ROLE_VIEWER = "viewer";
const ROLE_CONTRIBUTOR = "contributor";

const roles = [ROLE_ADMIN, ROLE_VIEWER, ROLE_CONTRIBUTOR];

const creatableField = ["user", "role", "email"];
const modifiableField = ["role"];
const _url = "/projects/:projectId/environments/:environmentId/access";

export default class EnvironmentAccess extends Ressource {
  constructor(environmentAccess, url, params, config) {
    super(
      url,
      paramDefaults,
      {},
      environmentAccess,
      creatableField,
      modifiableField,
      config
    );
    this.id = "";
    this.user = "";
    this.email = "";
    this.role = "";
    this.project = "";
    this.environment = "";
    this._required = ["role"];
  }

  static get(params, customUrl, config) {
    const { projectId, environmentId, id, ...queryParams } = params;
    const urlToCall = customUrl ? `${customUrl}/:id` : `:api_url${_url}/:id`;

    return super.get(
      urlToCall,
      { id, projectId, environmentId },
      super.getConfig(config),
      queryParams
    );
  }

  static query(params, customUrl, config) {
    const { projectId, environmentId, ...queryParams } = params;

    return super.query(
      customUrl || `:api_url${_url}`,
      { projectId, environmentId },
      super.getConfig(config),
      queryParams
    );
  }

  update(access) {
    return super.update(access);
  }

  /**
   * @inheritdoc
   */
  checkProperty(property, value) {
    const errors = {};

    if (property === "role" && roles.indexOf(value) === -1) {
      errors[property] = `Invalid environment role: '${value}'`;
    }
    return errors;
  }
  /**
   * {@inheritdoc}
   */
  getLink(rel, absolute = true) {
    if (rel === "#edit" && !this.hasLink(rel)) {
      return this.getUri(absolute);
    }
    return super.getLink(rel, absolute);
  }
  /**
   * Get the account information for this user.
   *
   * @throws \Exception
   *
   * @return Result
   */
  getAccount() {
    return Account.get({ id: this.id }, "", this.getConfig()).then(account => {
      if (!account) {
        throw new Error(`Account not found for user: ${this.id}`);
      }
      return account;
    });
  }

  /**
   * Get the user
   *
   * @throws \Exception
   *
   * @return User
   */
  getUser() {
    const embeddedUsers = this.getEmbedded("users");

    return new User(embeddedUsers[0], undefined, {}, this.getConfig());
  }
}
