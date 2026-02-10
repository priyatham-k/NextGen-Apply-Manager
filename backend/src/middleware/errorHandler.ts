// Error handler middleware placeholder
export default function errorHandler(err: any, req: any, res: any, next: any) {
  res.status(500).json({ error: 'Internal Server Error' });
}
