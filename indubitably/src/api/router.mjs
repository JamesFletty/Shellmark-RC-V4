function compilePath(path) {
  const names = [];
  const pattern = path
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        names.push(segment.slice(1));
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp(`^${pattern}$`), names };
}

export class Router {
  #routes = [];

  add(method, path, options, handler) {
    const { regex, names } = compilePath(path);
    this.#routes.push({ method: method.toUpperCase(), path, regex, names, options, handler });
    return this;
  }

  match(method, pathname) {
    for (const route of this.#routes) {
      if (route.method !== method.toUpperCase()) continue;
      const match = pathname.match(route.regex);
      if (!match) continue;
      return {
        ...route,
        params: Object.fromEntries(route.names.map((name, index) => [name, decodeURIComponent(match[index + 1])]))
      };
    }
    return null;
  }
}
