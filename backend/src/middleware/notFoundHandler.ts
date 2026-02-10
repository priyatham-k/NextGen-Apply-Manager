// Not found handler middleware placeholder
export default function notFoundHandler(req: any, res: any, next: any) {
  res.status(404).json({ error: 'Not Found' });
}
